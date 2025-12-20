import pathlib
import sys

import jwt
from fastapi.testclient import TestClient

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


def _auth_headers(role: str = "admin") -> dict[str, str]:
    token = jwt.encode({"role": role}, "dev-secret-change-me", algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def test_ports_multilingual_and_used_on_itinerary_outputs():
    client = TestClient(app)

    r = client.post(
        "/ports",
        json={
            "code": "ATH",
            "names": {"en": "Athens (Piraeus)", "ar": "أثينا (بيرايوس)"},
            "cities": {"en": "Athens", "ar": "أثينا"},
            "countries": {"en": "Greece", "ar": "اليونان"},
        },
        headers=_auth_headers(),
    )
    assert r.status_code == 200, r.text

    r = client.post(
        "/itineraries",
        json={
            "code": "PORT-I18N",
            "titles": {"en": "Ports i18n"},
            "stops": [
                {
                    "day_offset": 0,
                    "kind": "port",
                    "image_url": "https://example.com/ports/a.jpg",
                    "port_code": "ATH",
                    "arrival_time": "09:00",
                    "departure_time": "20:00",
                }
            ],
        },
        headers=_auth_headers(),
    )
    assert r.status_code == 200, r.text
    it = r.json()
    itinerary_id = it["id"]
    assert it["stops"][0]["port"]["code"] == "ATH"
    assert it["stops"][0]["port"]["name"] == "Athens (Piraeus)"
    assert it["stops"][0]["port"]["city"] == "Athens"
    assert it["stops"][0]["port"]["country"] == "Greece"

    r = client.get(f"/itineraries/{itinerary_id}", params={"lang": "ar"})
    assert r.status_code == 200, r.text
    it_ar = r.json()
    assert it_ar["stops"][0]["port"]["name"] == "أثينا (بيرايوس)"
    assert it_ar["stops"][0]["port"]["city"] == "أثينا"
    assert it_ar["stops"][0]["port"]["country"] == "اليونان"

    r = client.post(
        f"/itineraries/{itinerary_id}/sailings",
        json={"code": "S-PORT-I18N", "ship_id": "ship-1", "start_date": "2025-01-10"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200, r.text
    sailing = r.json()

    r = client.get(f"/sailings/{sailing['id']}/itinerary", params={"lang": "ar"})
    assert r.status_code == 200, r.text
    stops = r.json()
    assert stops[0]["port_code"] == "ATH"
    assert stops[0]["port_name"] == "أثينا (بيرايوس)"
    assert stops[0]["port_city"] == "أثينا"
    assert stops[0]["port_country"] == "اليونان"

