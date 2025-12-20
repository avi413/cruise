import pathlib
import sys

import jwt
from fastapi.testclient import TestClient

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


def _auth_headers(role: str = "admin") -> dict[str, str]:
    token = jwt.encode({"role": role}, "dev-secret-change-me", algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def test_itinerary_entity_compute_dates_and_related_sailings():
    client = TestClient(app)

    create_itinerary_payload = {
        "code": "TEST-3D",
        "titles": {"en": "Test Itinerary", "ar": "مسار تجريبي"},
        "stops": [
            {
                "day_offset": 0,
                "kind": "port",
                "image_url": "https://example.com/ports/a.jpg",
                "port_code": "ATH",
                "port_name": "Athens",
                "arrival_time": "09:00",
                "departure_time": "20:00",
                "labels": {"en": "Embark Athens"},
            },
            {
                "day_offset": 1,
                "kind": "sea",
                "image_url": "https://example.com/sea/1.jpg",
                "labels": {"en": "Day at sea"},
            },
            {
                "day_offset": 2,
                "kind": "port",
                "image_url": "https://example.com/ports/b.jpg",
                "port_code": "IST",
                "port_name": "Istanbul",
                "arrival_time": "08:00",
                "departure_time": "18:00",
                "labels": {"en": "Debark Istanbul"},
            },
        ],
    }

    r = client.post("/itineraries", json=create_itinerary_payload, headers=_auth_headers())
    assert r.status_code == 200, r.text
    itinerary = r.json()
    itinerary_id = itinerary["id"]
    assert itinerary["titles"]["en"] == "Test Itinerary"
    assert len(itinerary["stops"]) == 3

    r = client.get(f"/itineraries/{itinerary_id}/compute", params={"start_date": "2025-01-10"})
    assert r.status_code == 200, r.text
    computed = r.json()
    assert computed["start_date"] == "2025-01-10"
    assert computed["end_date"] == "2025-01-12"
    assert computed["days"] == 3
    assert computed["nights"] == 2

    r = client.post(
        f"/itineraries/{itinerary_id}/sailings",
        json={"code": "S001", "ship_id": "ship-1", "start_date": "2025-01-10"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200, r.text
    sailing = r.json()
    assert sailing["itinerary_id"] == itinerary_id
    assert sailing["start_date"] == "2025-01-10"
    assert sailing["end_date"] == "2025-01-12"
    assert sailing["embark_port_code"] == "ATH"
    assert sailing["debark_port_code"] == "IST"
    assert len(sailing["port_stops"]) == 2  # sea day does not generate a PortStop

    r = client.get(f"/itineraries/{itinerary_id}/sailings")
    assert r.status_code == 200, r.text
    related = r.json()
    assert len(related) == 1
    assert related[0]["id"] == sailing["id"]

    r = client.get("/sailings", params={"itinerary_id": itinerary_id})
    assert r.status_code == 200, r.text
    by_filter = r.json()
    assert len(by_filter) == 1
    assert by_filter[0]["id"] == sailing["id"]

