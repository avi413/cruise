## Cruise Management System (microservices starter)

Cloud-native, API-first Cruise Management System starter with independent microservices, async events, and a BFF/Edge API for web + mobile.

### What you can run right now

- **Ship Management**: `ship-service` (ships, amenities, maintenance)
- **Cruise & Itinerary**: `cruise-service` (sailings + port stops)
- **Pricing & Promotions**: `pricing-service` (dynamic quote calc + coupons)
- **Cabin & Booking**: `booking-service` (holds + confirm, Postgres-backed)
- **Customer/CRM**: `customer-service` (customer profiles + booking history projected from events)
- **Notifications**: `notification-service` (consumes booking events; exposes in-app feed endpoint)
- **Edge API (BFF)**: `edge-api` (website/mobile-friendly aggregation + proxy)

### Local development (Docker)

From repo root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Services (host ports):

- **Edge API**: `http://localhost:8000/docs`
- **Admin Portal (companies/fleet UI)**: `http://localhost:3000`
- **Ship**: `http://localhost:8001/docs`
- **Cruise**: `http://localhost:8002/docs`
- **Customer**: `http://localhost:8003/docs`
- **Pricing**: `http://localhost:8004/docs`
- **Booking**: `http://localhost:8005/docs`
- **Notifications**: `http://localhost:8006/docs`
- **RabbitMQ UI**: `http://localhost:15672` (guest/guest)

### Auth / roles (dev)

Most write endpoints require a Bearer token with a `role` claim.

For local dev, generate a token via `pricing-service`:

```bash
curl -s http://localhost:8004/dev/token \
  -H 'content-type: application/json' \
  -d '{"sub":"dev-user","role":"admin"}'
```

Use the returned token as:

```bash
-H "Authorization: Bearer <token>"
```

### Companies & fleets

Ships now belong to a **Company**. Create a company first, then create ships with `company_id`.

Via Edge API:

- List companies: `GET /v1/companies`
- Create company: `POST /v1/companies`
- List fleet: `GET /v1/companies/{company_id}/fleet`
- Create ship: `POST /v1/ships`

### Demo flow (quote → hold → confirm → notifications)

1) **Create a sailing + ship** (optional, for browsing via Edge API)

2) **Quote** (Edge API):

```bash
curl -s http://localhost:8000/v1/quote \
  -H 'content-type: application/json' \
  -d '{"cabin_type":"balcony","guests":[{"paxtype":"adult"},{"paxtype":"child"}],"coupon_code":"WELCOME10"}'
```

3) **Create a customer** (Customer service):

```bash
curl -s http://localhost:8003/customers \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <token>" \
  -d '{"email":"guest@example.com","first_name":"Ava","last_name":"Guest","loyalty_tier":"SILVER"}'
```

4) **Place a hold** (Edge API → Booking service):

```bash
curl -s http://localhost:8000/v1/holds \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <token>" \
  -d '{"customer_id":"<customer-id>","sailing_id":"S-001","cabin_type":"balcony","guests":{"adult":2,"child":1,"infant":0}}'
```

5) **Confirm booking**:

```bash
curl -s http://localhost:8000/v1/bookings/<booking-id>/confirm \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <token>" \
  -d '{"payment_token":"demo"}'
```

6) **See CRM booking history projection**:

```bash
curl -s http://localhost:8000/v1/customers/<customer-id>/bookings \
  -H "Authorization: Bearer <token>"
```

7) **See in-app notification feed**:

```bash
curl -s http://localhost:8006/notifications?customer_id=<customer-id> \
  -H "Authorization: Bearer <token>"
```

### Architecture notes

- **Microservices-first**: each service owns its API and data (separate bounded contexts)
- **Async messaging**: RabbitMQ topic exchange `cruise.events`
- **API-first**: OpenAPI via FastAPI `/docs` and `/openapi.json`
- **Cloud-native**: containers, Docker Compose for local; Kubernetes-ready layout

### Next modules to add

- Cabin inventory + real-time availability + deck plans
- Activity/event booking, dining reservations, onboard services
- Payments (PCI), GDPR tooling, audit logs
- BI/reporting, multi-tenancy, rate limiting, API gateway, tracing/metrics
