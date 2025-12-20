import json
import os
import time
from datetime import date
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Annotated, Literal

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
_FX_RATES_BY_COMPANY: dict[str, dict[tuple[str, str], dict]] = {}  # company_id -> {(base, quote) -> row}

SHIP_SERVICE_URL = os.getenv("SHIP_SERVICE_URL", "http://localhost:8001")
_DEFAULT_CURRENCY_CACHE: dict[str, tuple[str, float]] = {}  # company_id -> (currency, expires_at_epoch_s)


def _company_key(x_company_id: str | None) -> str:
    return (x_company_id or "").strip()


def _effective_overrides(company_id: str | None) -> domain.PricingOverrides | None:
    """
    Company-managed pricing:
    - If a company_id is provided, use that company's overrides (if any)
    - Do NOT fall back to global ("*") overrides
    - If no company_id is provided, return None (defaults apply)
    """
    key = _company_key(company_id)
    if not key:
        return None
    return _OVERRIDES_BY_COMPANY.get(key)


def _company_default_currency(company_id: str | None) -> str | None:
    """
    Read company default currency from the single source of truth: ship-service company settings.

    - Public read endpoint
    - Cached briefly to avoid chatty cross-service calls on high-traffic quote paths
    """
    key = _company_key(company_id)
    if not key:
        return None

    now = time.time()
    cached = _DEFAULT_CURRENCY_CACHE.get(key)
    if cached and cached[1] > now:
        return cached[0]

    url = f"{SHIP_SERVICE_URL}/companies/{key}/settings"
    try:
        req = Request(url, headers={"accept": "application/json"})
        with urlopen(req, timeout=2.5) as resp:
            raw = resp.read()
        data = json.loads(raw.decode("utf-8"))
        cur = str(((data or {}).get("localization") or {}).get("default_currency") or "").strip().upper()
        if cur:
            _DEFAULT_CURRENCY_CACHE[key] = (cur, now + 60.0)
            return cur
        return None
    except (HTTPError, URLError, TimeoutError, ValueError):
        # Never fail quotes due to settings lookup; fall back to USD.
        return None
def _normalize_currency(code: str | None, *, field: str = "currency") -> str:
    c = (code or "").strip().upper()
    if len(c) != 3 or not c.isalpha():
        raise HTTPException(status_code=400, detail=f"{field} must be a 3-letter ISO currency code")
    return c


def _money_convert_cents(amount_cents: int, *, rate: float, op: Literal["mul", "div"]) -> int:
    """
    Convert cents using a floating rate, rounding half-up to cents.

    - op="mul": amount * rate
    - op="div": amount / rate
    """
    try:
        r = Decimal(str(rate))
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Invalid FX rate")
    if r <= 0:
        raise HTTPException(status_code=400, detail="FX rate must be > 0")
    a = Decimal(int(amount_cents))
    out = (a * r) if op == "mul" else (a / r)
    return int(out.to_integral_value(rounding=ROUND_HALF_UP))


def _get_fx_rate(company_id: str, base: str, quote: str) -> tuple[float, Literal["mul", "div"]] | None:
    """
    Returns (rate, op) where:
    - op="mul": amount_in_base * rate = amount_in_quote
    - op="div": amount_in_base / rate = amount_in_quote (when inverse is stored)
    """
    rates = _FX_RATES_BY_COMPANY.get(company_id) or {}
    direct = rates.get((base, quote))
    if direct:
        return float(direct["rate"]), "mul"
    inv = rates.get((quote, base))
    if inv:
        return float(inv["rate"]), "div"
    return None


def _convert_quote_currency(company_id: str, q: domain.Quote, target_currency: str) -> domain.Quote:
    src = _normalize_currency(q.currency, field="quote.currency")
    dst = _normalize_currency(target_currency, field="currency")
    if src == dst:
        return q

    fx = _get_fx_rate(company_id, src, dst)
    if fx is None:
        raise HTTPException(status_code=400, detail=f"Missing FX rate for {src}->{dst}")
    rate, op = fx

    converted_lines: list[domain.QuoteLine] = []
    for l in q.lines:
        converted_lines.append(
            domain.QuoteLine(
                code=l.code,
                description=l.description,
                amount=_money_convert_cents(int(l.amount), rate=rate, op=op),
            )
        )

    subtotal = sum(int(l.amount) for l in converted_lines if l.code.startswith("fare."))
    discounts = sum(-int(l.amount) for l in converted_lines if l.code == "discount" and int(l.amount) < 0)
    taxes_fees = sum(int(l.amount) for l in converted_lines if l.code == "taxes_fees")
    total = sum(int(l.amount) for l in converted_lines)

    return domain.Quote(currency=dst, subtotal=subtotal, discounts=discounts, taxes_fees=taxes_fees, total=total, lines=converted_lines)


class GuestIn(BaseModel):
    paxtype: domain.Paxtype


class QuoteRequestIn(BaseModel):
    sailing_date: date | None = None
    cabin_type: domain.CabinType = "inside"
    cabin_category_code: str | None = Field(default=None, description="Optional cabin category code (e.g. CO3). If priced, takes priority over cabin_type fares.")
    price_type: str = Field(default="regular", min_length=1, description="Price type / rate plan for category pricing (e.g. regular, internet)")
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
        cur = (payload.currency or "").strip().upper()
        if not cur:
            cur = _company_default_currency(x_company_id) or "USD"
        company_id = _company_key(x_company_id)
        req = domain.QuoteRequest(
            sailing_date=payload.sailing_date,
            cabin_type=payload.cabin_type,
            cabin_category_code=payload.cabin_category_code,
            price_type=(payload.price_type or "regular"),
            guests=[domain.Guest(paxtype=g.paxtype) for g in payload.guests],
            coupon_code=payload.coupon_code,
            loyalty_tier=payload.loyalty_tier,
            currency=cur,
        )
        q = domain.quote_with_overrides(req, today=date.today(), overrides=_effective_overrides(x_company_id))
        if payload.currency and company_id:
            q = _convert_quote_currency(company_id, q, payload.currency)
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
    company_id: str | None = Field(default=None, description="Optional: target company_id (tenant). If omitted, X-Company-Id is used.")


class BaseFareIn(BaseModel):
    paxtype: domain.Paxtype
    amount: int = Field(ge=0, description="Amount in cents")
    company_id: str | None = Field(default=None, description="Optional: target company_id (tenant). If omitted, X-Company-Id is used.")


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
                        "price_type": (getattr(r, "price_type", None) or "regular"),
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
def set_cabin_multiplier(
    payload: CabinMultiplierIn,
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    key = _company_key(payload.company_id) or _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed pricing requires X-Company-Id (or company_id). Global overrides are not supported.")
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
                "price_type": (getattr(r, "price_type", None) or "regular"),
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
def set_base_fare(
    payload: BaseFareIn,
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    key = _company_key(payload.company_id) or _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed pricing requires X-Company-Id (or company_id). Global overrides are not supported.")
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
                "price_type": (getattr(r, "price_type", None) or "regular"),
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
    price_type: str = Field(default="regular", min_length=1, description="Price type / rate plan (e.g. regular, internet)")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    min_guests: int = Field(default=2, ge=1, description="Minimum billable occupancy")
    price_per_person: int = Field(ge=0, description="Per-person price in cents")
    effective_start_date: date | None = Field(default=None, description="Optional: apply from this cruise/sailing date (inclusive)")
    effective_end_date: date | None = Field(default=None, description="Optional: apply until this cruise/sailing date (inclusive)")
    company_id: str | None = Field(default=None, description="Optional: target company_id (tenant). If omitted, X-Company-Id is used.")


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
                    "price_type": (getattr(r, "price_type", None) or "regular"),
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
def upsert_category_price(
    payload: CategoryPriceIn,
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    key = _company_key(payload.company_id) or _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed pricing requires X-Company-Id (or company_id). Global pricing rules are not supported.")
    cur = _OVERRIDES_BY_COMPANY.get(key) or domain.PricingOverrides()

    code = (payload.category_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="category_code is required")
    price_type = (payload.price_type or "regular").strip().lower()
    if not price_type:
        raise HTTPException(status_code=400, detail="price_type is required")
    curcy = (payload.currency or "USD").strip().upper()
    rule = domain.CategoryPriceRule(
        category_code=code,
        price_type=price_type,
        currency=curcy,
        min_guests=int(payload.min_guests),
        price_per_person=int(payload.price_per_person),
        effective_start_date=payload.effective_start_date,
        effective_end_date=payload.effective_end_date,
    )

    rules = list(cur.category_prices or [])
    # Upsert by (category_code, price_type, currency, min_guests, effective_start_date, effective_end_date)
    rules = [
        r
        for r in rules
        if not (
            r.category_code == rule.category_code
            and (getattr(r, "price_type", None) or "regular") == rule.price_type
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
            (getattr(r, "price_type", None) or "regular"),
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
                "price_type": (getattr(r, "price_type", None) or "regular"),
                "currency": r.currency,
                "min_guests": r.min_guests,
                "price_per_person": r.price_per_person,
                "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
            }
            for r in (v.category_prices or [])
        ],
    )


@app.post("/category-prices/bulk", response_model=CategoryPricesOut)
def upsert_category_prices_bulk(
    payload: list[CategoryPriceIn],
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    """
    Bulk upsert category pricing rules.

    This is optimized for admin workflows where you want to apply the same set of
    price buckets (e.g. regular/internet/...) across many cabin categories.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="payload must be a non-empty list")

    # Company key is shared across the whole batch.
    key = _company_key(payload[0].company_id) or _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed pricing requires X-Company-Id (or company_id). Global pricing rules are not supported.")

    # Disallow mixing companies in one request.
    for p in payload:
        if p.company_id is not None and _company_key(p.company_id) != key:
            raise HTTPException(status_code=400, detail="Bulk upsert must target exactly one company_id")

    cur = _OVERRIDES_BY_COMPANY.get(key) or domain.PricingOverrides()
    rules = list(cur.category_prices or [])

    for p in payload:
        code = (p.category_code or "").strip().upper()
        if not code:
            raise HTTPException(status_code=400, detail="category_code is required")
        price_type = (p.price_type or "regular").strip().lower()
        if not price_type:
            raise HTTPException(status_code=400, detail="price_type is required")
        curcy = (p.currency or "USD").strip().upper()

        rule = domain.CategoryPriceRule(
            category_code=code,
            price_type=price_type,
            currency=curcy,
            min_guests=int(p.min_guests),
            price_per_person=int(p.price_per_person),
            effective_start_date=p.effective_start_date,
            effective_end_date=p.effective_end_date,
        )

        # Upsert by (category_code, price_type, currency, min_guests, effective_start_date, effective_end_date)
        rules = [
            r
            for r in rules
            if not (
                r.category_code == rule.category_code
                and (getattr(r, "price_type", None) or "regular") == rule.price_type
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
            (getattr(r, "price_type", None) or "regular"),
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
                "price_type": (getattr(r, "price_type", None) or "regular"),
                "currency": r.currency,
                "min_guests": r.min_guests,
                "price_per_person": r.price_per_person,
                "effective_start_date": r.effective_start_date.isoformat() if r.effective_start_date else None,
                "effective_end_date": r.effective_end_date.isoformat() if r.effective_end_date else None,
            }
            for r in (v.category_prices or [])
        ],
    )


class FxRateIn(BaseModel):
    base: str = Field(min_length=3, max_length=3, description="Base currency (ISO 4217), e.g. USD")
    quote: str = Field(min_length=3, max_length=3, description="Quote currency (ISO 4217), e.g. EUR")
    rate: float = Field(gt=0.0, description="1 base = rate quote")
    as_of: datetime | None = Field(default=None, description="Optional ISO timestamp for audit/display")
    company_id: str | None = Field(default=None, description="Optional: target company_id (tenant). If omitted, X-Company-Id is used.")


class FxRateOut(BaseModel):
    company_id: str
    base: str
    quote: str
    rate: float
    as_of: datetime


@app.get("/fx-rates", response_model=list[FxRateOut])
def list_fx_rates(
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    key = _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed FX requires X-Company-Id. Global rates are not supported.")
    rows = list((_FX_RATES_BY_COMPANY.get(key) or {}).values())
    rows = sorted(rows, key=lambda r: (r["base"], r["quote"]))
    return [FxRateOut(company_id=key, base=r["base"], quote=r["quote"], rate=float(r["rate"]), as_of=r["as_of"]) for r in rows]


@app.post("/fx-rates", response_model=FxRateOut)
def upsert_fx_rate(
    payload: FxRateIn,
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    key = _company_key(payload.company_id) or _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed FX requires X-Company-Id (or company_id). Global rates are not supported.")

    base = _normalize_currency(payload.base, field="base")
    quote = _normalize_currency(payload.quote, field="quote")
    if base == quote:
        raise HTTPException(status_code=400, detail="base and quote must be different")

    as_of = payload.as_of or datetime.now(tz=timezone.utc)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)

    rates = dict(_FX_RATES_BY_COMPANY.get(key) or {})
    rates[(base, quote)] = {"base": base, "quote": quote, "rate": float(payload.rate), "as_of": as_of}
    _FX_RATES_BY_COMPANY[key] = rates
    r = rates[(base, quote)]
    return FxRateOut(company_id=key, base=r["base"], quote=r["quote"], rate=float(r["rate"]), as_of=r["as_of"])


@app.delete("/fx-rates/{base}/{quote}")
def delete_fx_rate(
    base: str,
    quote: str,
    x_company_id: Annotated[str | None, Header()] = None,
    _principal=Depends(require_roles("staff", "admin")),
):
    key = _company_key(x_company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Company-managed FX requires X-Company-Id. Global rates are not supported.")
    b = _normalize_currency(base, field="base")
    q = _normalize_currency(quote, field="quote")
    rates = dict(_FX_RATES_BY_COMPANY.get(key) or {})
    rates.pop((b, q), None)
    _FX_RATES_BY_COMPANY[key] = rates
    return {"status": "ok"}


@app.delete("/overrides/{company_id}")
def clear_overrides(company_id: str, _principal=Depends(require_roles("staff", "admin"))):
    key = _company_key(company_id)
    if not key or key == "*":
        raise HTTPException(status_code=400, detail="Global overrides are not supported.")
    _OVERRIDES_BY_COMPANY.pop(key, None)
    return {"status": "ok"}
