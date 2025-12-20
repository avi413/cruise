from datetime import date, timedelta

from app import domain


def test_quote_requires_guest():
    req = domain.QuoteRequest(
        sailing_date=None,
        cabin_type="inside",
        cabin_category_code=None,
        guests=[],
        coupon_code=None,
        loyalty_tier=None,
        currency="USD",
    )

    try:
        domain.quote(req, today=date.today())
        assert False, "Expected ValueError"
    except ValueError:
        assert True


def test_quote_increases_as_sailing_nears():
    today = date.today()

    far = domain.quote(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=200),
            cabin_type="inside",
            cabin_category_code=None,
            guests=[domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
            currency="USD",
        ),
        today=today,
    )

    near = domain.quote(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=10),
            cabin_type="inside",
            cabin_category_code=None,
            guests=[domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
            currency="USD",
        ),
        today=today,
    )

    assert near.total > far.total


def test_coupon_discount_applies():
    today = date.today()

    no_coupon = domain.quote(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=60),
            cabin_type="balcony",
            cabin_category_code=None,
            guests=[domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
            currency="USD",
        ),
        today=today,
    )

    with_coupon = domain.quote(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=60),
            cabin_type="balcony",
            cabin_category_code=None,
            guests=[domain.Guest(paxtype="adult")],
            coupon_code="WELCOME10",
            loyalty_tier=None,
            currency="USD",
        ),
        today=today,
    )

    assert with_coupon.total < no_coupon.total


def test_category_pricing_applies_min_guests():
    today = date.today()
    overrides = domain.PricingOverrides(
        category_prices=[
            domain.CategoryPriceRule(category_code="CO3", currency="USD", min_guests=2, price_per_person=100_00),
        ]
    )
    q = domain.quote_with_overrides(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=30),
            cabin_type="oceanview",
            cabin_category_code="CO3",
            guests=[domain.Guest(paxtype="adult")],  # 1 guest, but min 2 billed
            coupon_code=None,
            loyalty_tier=None,
            currency="USD",
        ),
        today=today,
        overrides=overrides,
    )
    assert q.subtotal == 2 * 100_00


def test_category_pricing_is_per_sailing_date():
    today = date.today()
    overrides = domain.PricingOverrides(
        category_prices=[
            domain.CategoryPriceRule(
                category_code="CO3",
                currency="USD",
                min_guests=2,
                price_per_person=100_00,
                effective_start_date=today,
                effective_end_date=today,
            ),
        ]
    )
    # matching date -> category pricing
    q1 = domain.quote_with_overrides(
        domain.QuoteRequest(
            sailing_date=today,
            cabin_type="inside",
            guests=[domain.Guest(paxtype="adult"), domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
            cabin_category_code="CO3",
            currency="USD",
        ),
        today=today,
        overrides=overrides,
    )
    assert q1.subtotal == 2 * 100_00

    # different date -> falls back to cabin_type pricing
    q2 = domain.quote_with_overrides(
        domain.QuoteRequest(
            sailing_date=today.replace(day=min(28, today.day)) + timedelta(days=1),
            cabin_type="inside",
            guests=[domain.Guest(paxtype="adult"), domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
            cabin_category_code="CO3",
            currency="USD",
        ),
        today=today,
        overrides=overrides,
    )
    assert q2.lines[0].code.startswith("fare.")


def test_category_pricing_can_select_price_type():
    today = date.today()
    overrides = domain.PricingOverrides(
        category_prices=[
            domain.CategoryPriceRule(category_code="CO3", price_type="regular", currency="EUR", min_guests=2, price_per_person=300_00),
            domain.CategoryPriceRule(category_code="CO3", price_type="internet", currency="EUR", min_guests=2, price_per_person=290_00),
        ]
    )

    q = domain.quote_with_overrides(
        domain.QuoteRequest(
            sailing_date=today,
            cabin_type="inside",
            cabin_category_code="CO3",
            guests=[domain.Guest(paxtype="adult"), domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
            currency="EUR",
            price_type="internet",
        ),
        today=today,
        overrides=overrides,
    )
    assert q.subtotal == 2 * 290_00
