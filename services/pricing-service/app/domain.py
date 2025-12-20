from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

Paxtype = Literal["adult", "child", "infant"]
CabinType = Literal["inside", "oceanview", "balcony", "suite"]
PriceType = str


@dataclass(frozen=True)
class Guest:
    paxtype: Paxtype


@dataclass(frozen=True)
class CategoryPriceRule:
    """
    Cabin-category pricing rule (e.g. CO3).

    Interpretation:
    - price_per_person is per-person for the cabin category
    - min_guests is the minimum billable occupancy for the cabin (e.g. 2)
      so billable_guests = max(actual_guest_count, min_guests)
    """

    category_code: str
    currency: str
    min_guests: int
    price_per_person: int  # cents
    # "rate plan" / price bucket (e.g. regular, internet, promo, etc).
    # Kept flexible as a free-form string for now.
    price_type: PriceType = "regular"
    # Date applicability (cruise/sailing date). If both None, applies to any date.
    # If one bound is provided, it's treated as an open-ended range.
    effective_start_date: date | None = None
    effective_end_date: date | None = None


@dataclass(frozen=True)
class QuoteRequest:
    sailing_date: date | None
    cabin_type: CabinType
    guests: list[Guest]
    coupon_code: str | None
    loyalty_tier: str | None
    cabin_category_code: str | None = None
    currency: str = "USD"
    # Which "bucket" to use when category pricing exists (regular/internet/etc).
    price_type: PriceType = "regular"


@dataclass(frozen=True)
class QuoteLine:
    code: str
    description: str
    amount: int


@dataclass(frozen=True)
class Quote:
    currency: str
    subtotal: int
    discounts: int
    taxes_fees: int
    total: int
    lines: list[QuoteLine]


@dataclass(frozen=True)
class PricingOverrides:
    base_by_pax: dict[Paxtype, int] | None = None
    cabin_multiplier: dict[CabinType, float] | None = None
    demand_multiplier: float | None = None
    category_prices: list[CategoryPriceRule] | None = None


_BASE_BY_PAX: dict[Paxtype, int] = {
    "adult": 100_000,
    "child": 60_000,
    "infant": 10_000,
}

_CABIN_MULTIPLIER: dict[CabinType, float] = {
    "inside": 1.0,
    "oceanview": 1.2,
    "balcony": 1.4,
    "suite": 2.0,
}


def _demand_multiplier(sailing_date: date | None, today: date) -> float:
    if sailing_date is None:
        return 1.0
    days = (sailing_date - today).days
    if days < 0:
        return 1.25
    if days <= 30:
        return 1.20
    if days <= 90:
        return 1.10
    return 1.0


def _discount_rate(req: QuoteRequest, child_count: int) -> float:
    code = (req.coupon_code or "").strip().upper()
    tier = (req.loyalty_tier or "").strip().upper()

    rate = 0.0

    if code == "WELCOME10":
        rate = max(rate, 0.10)
    if code == "FAMILY5" and child_count >= 2:
        rate = max(rate, 0.05)

    if tier == "GOLD":
        rate = max(rate, 0.15)
    if tier == "SILVER":
        rate = max(rate, 0.07)

    return rate


def quote(req: QuoteRequest, today: date) -> Quote:
    return quote_with_overrides(req, today=today, overrides=None)


def quote_with_overrides(req: QuoteRequest, today: date, overrides: PricingOverrides | None) -> Quote:
    if not req.guests:
        raise ValueError("At least one guest is required")

    # Category pricing (e.g. CO3) takes priority when configured.
    # This supports negotiated pricing per cabin category with minimum occupancy.
    category_code = (req.cabin_category_code or "").strip().upper() or None
    if category_code and overrides and overrides.category_prices:
        rules = [r for r in overrides.category_prices if (r.category_code or "").strip().upper() == category_code]

        # Prefer matching currency (if requested).
        req_currency = (req.currency or "").strip().upper() or None
        if req_currency:
            cur_matches = [r for r in rules if (r.currency or "").strip().upper() == req_currency]
            if cur_matches:
                rules = cur_matches

        # Prefer matching price type (rate plan), with safe fallback to "regular".
        desired_pt = (req.price_type or "regular").strip().lower() or "regular"

        def _norm_pt(x: str | None) -> str:
            return (x or "regular").strip().lower() or "regular"

        pt_matches = [r for r in rules if _norm_pt(getattr(r, "price_type", None)) == desired_pt]
        if pt_matches:
            rules = pt_matches
        elif desired_pt != "regular":
            reg = [r for r in rules if _norm_pt(getattr(r, "price_type", None)) == "regular"]
            if reg:
                rules = reg

        if rules:
            guest_count = len(req.guests)
            sail = req.sailing_date

            def _date_ok(r: CategoryPriceRule) -> bool:
                if sail is None:
                    # If no sailing_date provided, allow only rules that are not date-restricted.
                    return r.effective_start_date is None and r.effective_end_date is None
                if r.effective_start_date is not None and sail < r.effective_start_date:
                    return False
                if r.effective_end_date is not None and sail > r.effective_end_date:
                    return False
                return True

            rules = [r for r in rules if _date_ok(r)]
            if not rules:
                # fall back to cabin_type pricing if nothing matches the date
                rules = []

        if rules:
            # Prefer the "closest" occupancy bracket:
            # - if there is a rule with min_guests <= guest_count, pick the largest such min_guests
            # - otherwise pick the smallest min_guests available (and bill min occupancy)
            best = None
            le = [r for r in rules if int(r.min_guests) <= guest_count]
            if le:
                best = sorted(le, key=lambda r: int(r.min_guests), reverse=True)[0]
            else:
                best = sorted(rules, key=lambda r: int(r.min_guests))[0]

            min_guests = max(1, int(best.min_guests))
            billable = max(guest_count, min_guests)
            unit = int(best.price_per_person)
            if unit < 0:
                raise ValueError("Invalid category pricing rule: price_per_person must be >= 0")
            subtotal = unit * billable

            lines: list[QuoteLine] = [
                QuoteLine(
                    code=f"fare.category.{category_code}.{(best.price_type or 'regular').strip().lower() or 'regular'}",
                    description=f"Cabin category {category_code} ({best.currency}) [{(best.price_type or 'regular').strip().lower() or 'regular'}] — {billable} pax billed (min {min_guests})",
                    amount=subtotal,
                )
            ]

            discount_rate = _discount_rate(req, child_count=sum(1 for g in req.guests if g.paxtype == "child"))
            discounts = int(round(subtotal * discount_rate))
            if discounts:
                lines.append(
                    QuoteLine(
                        code="discount",
                        description=f"Discount ({int(discount_rate * 100)}%)",
                        amount=-discounts,
                    )
                )

            taxable = subtotal - discounts
            taxes_fees = int(round(taxable * 0.08))
            if taxes_fees:
                lines.append(
                    QuoteLine(
                        code="taxes_fees",
                        description="Estimated taxes & fees (8%)",
                        amount=taxes_fees,
                    )
                )

            total = taxable + taxes_fees
            return Quote(
                currency=(best.currency or req.currency or "USD"),
                subtotal=subtotal,
                discounts=discounts,
                taxes_fees=taxes_fees,
                total=total,
                lines=lines,
            )

    cabin_mult = _CABIN_MULTIPLIER[req.cabin_type]
    if overrides and overrides.cabin_multiplier and req.cabin_type in overrides.cabin_multiplier:
        cabin_mult = float(overrides.cabin_multiplier[req.cabin_type])

    demand_mult = _demand_multiplier(req.sailing_date, today=today)
    if overrides and overrides.demand_multiplier is not None:
        demand_mult = float(overrides.demand_multiplier)

    base_by_pax = _BASE_BY_PAX
    if overrides and overrides.base_by_pax:
        # merge with defaults
        base_by_pax = {**_BASE_BY_PAX, **overrides.base_by_pax}

    pax_counts: dict[Paxtype, int] = {"adult": 0, "child": 0, "infant": 0}
    for g in req.guests:
        pax_counts[g.paxtype] += 1

    lines: list[QuoteLine] = []
    subtotal = 0

    for paxtype, count in pax_counts.items():
        if count == 0:
            continue
        base = base_by_pax[paxtype]
        amount = int(round(base * cabin_mult * demand_mult)) * count
        subtotal += amount
        lines.append(
            QuoteLine(
                code=f"fare.{paxtype}",
                description=f"Base fare ({paxtype}) x{count}",
                amount=amount,
            )
        )

    discount_rate = _discount_rate(req, child_count=pax_counts["child"])
    discounts = int(round(subtotal * discount_rate))
    if discounts:
        lines.append(
            QuoteLine(
                code="discount",
                description=f"Discount ({int(discount_rate * 100)}%)",
                amount=-discounts,
            )
        )

    taxable = subtotal - discounts
    taxes_fees = int(round(taxable * 0.08))
    if taxes_fees:
        lines.append(
            QuoteLine(
                code="taxes_fees",
                description="Estimated taxes & fees (8%)",
                amount=taxes_fees,
            )
        )

    total = taxable + taxes_fees

    return Quote(
        currency=(req.currency or "USD"),
        subtotal=subtotal,
        discounts=discounts,
        taxes_fees=taxes_fees,
        total=total,
        lines=lines,
    )
