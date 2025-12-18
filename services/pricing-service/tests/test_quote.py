from datetime import date, timedelta

from app import domain


def test_quote_requires_guest():
    req = domain.QuoteRequest(
        sailing_date=None,
        cabin_type="inside",
        guests=[],
        coupon_code=None,
        loyalty_tier=None,
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
            guests=[domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
        ),
        today=today,
    )

    near = domain.quote(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=10),
            cabin_type="inside",
            guests=[domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
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
            guests=[domain.Guest(paxtype="adult")],
            coupon_code=None,
            loyalty_tier=None,
        ),
        today=today,
    )

    with_coupon = domain.quote(
        domain.QuoteRequest(
            sailing_date=today + timedelta(days=60),
            cabin_type="balcony",
            guests=[domain.Guest(paxtype="adult")],
            coupon_code="WELCOME10",
            loyalty_tier=None,
        ),
        today=today,
    )

    assert with_coupon.total < no_coupon.total
