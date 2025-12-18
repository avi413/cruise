from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import domain
from .security import get_principal_optional, issue_token

app = FastAPI(
    title="Pricing & Promotions Service",
    version="0.1.0",
    description="Dynamic pricing, promotions, coupon codes, and real-time quote calculation.",
)


class GuestIn(BaseModel):
    paxtype: domain.Paxtype


class QuoteRequestIn(BaseModel):
    sailing_date: date | None = None
    cabin_type: domain.CabinType = "inside"
    guests: list[GuestIn] = Field(min_length=1)
    coupon_code: str | None = None
    loyalty_tier: str | None = None


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
def create_quote(payload: QuoteRequestIn, _principal=Depends(get_principal_optional)):
    try:
        req = domain.QuoteRequest(
            sailing_date=payload.sailing_date,
            cabin_type=payload.cabin_type,
            guests=[domain.Guest(paxtype=g.paxtype) for g in payload.guests],
            coupon_code=payload.coupon_code,
            loyalty_tier=payload.loyalty_tier,
        )
        q = domain.quote(req, today=date.today())
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
