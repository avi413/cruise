from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import domain
from .security import get_principal_optional, issue_token, require_roles

app = FastAPI(
    title="Pricing & Promotions Service",
    version="0.1.0",
    description="Dynamic pricing, promotions, coupon codes, and real-time quote calculation.",
)

_OVERRIDES_BY_COMPANY: dict[str, domain.PricingOverrides] = {}  # company_id -> overrides; "*" for global


def _company_key(x_company_id: str | None) -> str:
    return (x_company_id or "").strip() or "*"


def _effective_overrides(company_id: str | None) -> domain.PricingOverrides | None:
    key = _company_key(company_id)
    o = _OVERRIDES_BY_COMPANY.get(key)
    if o is not None:
        return o
    # fallback to global if company-specific missing
    return _OVERRIDES_BY_COMPANY.get("*")


class GuestIn(BaseModel):
    paxtype: domain.Paxtype


class QuoteRequestIn(BaseModel):
    sailing_date: date | None = None
    cabin_type: domain.CabinType = "inside"
    cabin_category_code: str | None = Field(default=None, description="Optional cabin category code (e.g. CO3). If priced, takes priority over cabin_type fares.")
    guests: list[GuestIn] = Field(min_length=1)
    coupon_code: str | None = None
    loyalty_tier: str | None = None
    currency: str | None = Field(default=None, description="ISO currency (default USD)")


class QuoteLineOut(BaseModel):
    code: str
    description: str
    amount: int


class QuoteOut(BaseModel):
    currency: str
    subtotal: int
    discounts: int
    taxes_fees: int
    total: int
    lines: list[QuoteLineOut]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/quote", response_model=QuoteOut)
def create_quote(
    payload: QuoteRequestIn,
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(get_principal_optional),
):
    try:
        req = domain.QuoteRequest(
            sailing_date=payload.sailing_date,
            cabin_type=payload.cabin_type,
            cabin_category_code=payload.cabin_category_code,
            guests=[domain.Guest(paxtype=g.paxtype) for g in payload.guests],
            coupon_code=payload.coupon_code,
            loyalty_tier=payload.loyalty_tier,
            currency=(payload.currency or "USD"),
        )
        q = domain.quote_with_overrides(req, today=date.today(), overrides=_effective_overrides(x_company_id))
        return QuoteOut(
            currency=q.currency,
            subtotal=q.subtotal,
            discounts=q.discounts,
            taxes_fees=q.taxes_fees,
            total=q.total,
            lines=[QuoteLineOut(code=l.code, description=l.description, amount=l.amount) for l in q.lines],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class TokenRequest(BaseModel):
    sub: str = "dev-user"
    role: str = Field(default="guest", description="guest|agent|staff|admin")


@app.post("/dev/token")
def dev_token(payload: TokenRequest):
    return {"access_token": issue_token(sub=payload.sub, role=payload.role), "token_type": "bearer"}


class CabinMultiplierIn(BaseModel):
    cabin_type: domain.CabinType
    multiplier: float = Field(gt=0.0)
    company_id: str | None = Field(default=None, description="Optional: target company_id; omit for global")


class BaseFareIn(BaseModel):
    paxtype: domain.Paxtype
    amount: int = Field(ge=0, description="Amount in cents")
    company_id: str | None = Field(default=None, description="Optional: target company_id; omit for global")


class OverridesOut(BaseModel):
    company_id: str
    base_by_pax: dict[str, int] | None
    cabin_multiplier: dict[str, float] | None
    demand_multiplier: float | None
    category_prices: list[dict] | None = None


@app.get("/overrides", response_model=list[OverridesOut])
def list_overrides(_principal=Depends(require_roles("staff", "admin"))):
    items: list[OverridesOut] = []
    for k, v in sorted(_OVERRIDES_BY_COMPANY.items(), key=lambda kv: kv[0]):
        items.append(
            OverridesOut(
                company_id=k,
                base_by_pax={p: int(a) for p, a in (v.base_by_pax or {}).items()} if v.base_by_pax else None,
                cabin_multiplier={c: float(m) for c, m in (v.cabin_multiplier or {}).items()} if v.cabin_multiplier else None,
                demand_multiplier=float(v.demand_multiplier) if v.demand_multiplier is not None else None,
                category_prices=[
                    {
                        "category_code": r.category_code,
                        "currency": r.currency,
                        "min_guests": r.min_guests,
                        "price_per_person": r.price_per_person,
                        "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                        "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
                    }
                    for r in (v.category_prices or [])
                ]
                if v.category_prices
                else None,
            )
        )
    return items


@app.post("/overrides/cabin-multipliers", response_model=OverridesOut)
def set_cabin_multiplier(payload: CabinMultiplierIn, _principal=Depends(require_roles("staff", "admin"))):
    key = _company_key(payload.company_id)
    cur = _OVERRIDES_BY_COMPANY.get(key) or domain.PricingOverrides()
    cabin_multiplier = dict(cur.cabin_multiplier or {})
    cabin_multiplier[payload.cabin_type] = float(payload.multiplier)
    _OVERRIDES_BY_COMPANY[key] = domain.PricingOverrides(
        base_by_pax=cur.base_by_pax,
        cabin_multiplier=cabin_multiplier,
        demand_multiplier=cur.demand_multiplier,
        category_prices=cur.category_prices,
    )
    v = _OVERRIDES_BY_COMPANY[key]
    return OverridesOut(
        company_id=key,
        base_by_pax={p: int(a) for p, a in (v.base_by_pax or {}).items()} if v.base_by_pax else None,
        cabin_multiplier={c: float(m) for c, m in (v.cabin_multiplier or {}).items()} if v.cabin_multiplier else None,
        demand_multiplier=float(v.demand_multiplier) if v.demand_multiplier is not None else None,
        category_prices=[
            {
                "category_code": r.category_code,
                "currency": r.currency,
                "min_guests": r.min_guests,
                "price_per_person": r.price_per_person,
                "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
            }
            for r in (v.category_prices or [])
        ]
        if v.category_prices
        else None,
    )


@app.post("/overrides/base-fares", response_model=OverridesOut)
def set_base_fare(payload: BaseFareIn, _principal=Depends(require_roles("staff", "admin"))):
    key = _company_key(payload.company_id)
    cur = _OVERRIDES_BY_COMPANY.get(key) or domain.PricingOverrides()
    base_by_pax = dict(cur.base_by_pax or {})
    base_by_pax[payload.paxtype] = int(payload.amount)
    _OVERRIDES_BY_COMPANY[key] = domain.PricingOverrides(
        base_by_pax=base_by_pax,
        cabin_multiplier=cur.cabin_multiplier,
        demand_multiplier=cur.demand_multiplier,
        category_prices=cur.category_prices,
    )
    v = _OVERRIDES_BY_COMPANY[key]
    return OverridesOut(
        company_id=key,
        base_by_pax={p: int(a) for p, a in (v.base_by_pax or {}).items()} if v.base_by_pax else None,
        cabin_multiplier={c: float(m) for c, m in (v.cabin_multiplier or {}).items()} if v.cabin_multiplier else None,
        demand_multiplier=float(v.demand_multiplier) if v.demand_multiplier is not None else None,
        category_prices=[
            {
                "category_code": r.category_code,
                "currency": r.currency,
                "min_guests": r.min_guests,
                "price_per_person": r.price_per_person,
                "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
            }
            for r in (v.category_prices or [])
        ]
        if v.category_prices
        else None,
    )


class CategoryPriceIn(BaseModel):
    category_code: str = Field(min_length=1, description="Cabin category code, e.g. CO3")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    min_guests: int = Field(default=2, ge=1, description="Minimum billable occupancy")
    price_per_person: int = Field(ge=0, description="Per-person price in cents")
    effective_start_date: date | None = Field(default=None, description="Optional: apply from this cruise/sailing date (inclusive)")
    effective_end_date: date | None = Field(default=None, description="Optional: apply until this cruise/sailing date (inclusive)")
    company_id: str | None = Field(default=None, description="Optional: target company_id; omit for global")


class CategoryPricesOut(BaseModel):
    company_id: str
    items: list[dict]


@app.get("/category-prices", response_model=list[CategoryPricesOut])
def list_category_prices(_principal=Depends(require_roles("staff", "admin"))):
    out: list[CategoryPricesOut] = []
    for k, v in sorted(_OVERRIDES_BY_COMPANY.items(), key=lambda kv: kv[0]):
        items = []
        for r in (v.category_prices or []):
            items.append(
                {
                    "category_code": r.category_code,
                    "currency": r.currency,
                    "min_guests": r.min_guests,
                    "price_per_person": r.price_per_person,
                    "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                    "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
                }
            )
        out.append(CategoryPricesOut(company_id=k, items=items))
    return out


@app.post("/category-prices", response_model=CategoryPricesOut)
def upsert_category_price(payload: CategoryPriceIn, _principal=Depends(require_roles("staff", "admin"))):
    key = _company_key(payload.company_id)
    cur = _OVERRIDES_BY_COMPANY.get(key) or domain.PricingOverrides()

    code = (payload.category_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="category_code is required")
    curcy = (payload.currency or "USD").strip().upper()
    rule = domain.CategoryPriceRule(
        category_code=code,
        currency=curcy,
        min_guests=int(payload.min_guests),
        price_per_person=int(payload.price_per_person),
        effective_start_date=payload.effective_start_date,
        effective_end_date=payload.effective_end_date,
    )

    rules = list(cur.category_prices or [])
    # Upsert by (category_code, currency, min_guests, effective_start_date, effective_end_date)
    rules = [
        r
        for r in rules
        if not (
            r.category_code == rule.category_code
            and r.currency == rule.currency
            and int(r.min_guests) == int(rule.min_guests)
            and r.effective_start_date == rule.effective_start_date
            and r.effective_end_date == rule.effective_end_date
        )
    ]
    rules.append(rule)
    rules = sorted(
        rules,
        key=lambda r: (
            r.category_code,
            r.currency,
            r.effective_start_date or date.min,
            r.effective_end_date or date.max,
            int(r.min_guests),
        ),
    )

    _OVERRIDES_BY_COMPANY[key] = domain.PricingOverrides(
        base_by_pax=cur.base_by_pax,
        cabin_multiplier=cur.cabin_multiplier,
        demand_multiplier=cur.demand_multiplier,
        category_prices=rules,
    )
    v = _OVERRIDES_BY_COMPANY[key]
    return CategoryPricesOut(
        company_id=key,
        items=[
            {
                "category_code": r.category_code,
                "currency": r.currency,
                "min_guests": r.min_guests,
                "price_per_person": r.price_per_person,
                "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
            }
            for r in (v.category_prices or [])
        ],
    )


@app.delete("/overrides/{company_id}")
def clear_overrides(company_id: str, _principal=Depends(require_roles("staff", "admin"))):
    key = _company_key(company_id)
    _OVERRIDES_BY_COMPANY.pop(key, None)
    return {"status": "ok"}
