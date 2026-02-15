# Event-Driven E-commerce Microservices

All services now follow the same source layout as `User-Service`:

- `config/`
- `controllers/`
- `events/`
- `middlewares/`
- `routes/`
- `services/`
- `utils/`

Current services:

- `User-Service` (port `3001`)
- `Cart-Service` (port `3002`)

## Event Contract

`User-Service` publishes `USER_CREATED` to Kafka topic `user-events`:

```json
{
  "eventId": "uuid",
  "eventType": "USER_CREATED",
  "eventVersion": 1,
  "occurredAt": "2026-02-15T12:00:00.000Z",
  "producer": "user-service",
  "data": {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "role": "user",
    "accountStatus": "active"
  }
}
```

`Cart-Service` consumes that event and creates local user projection + user cart.

## Database Schemas

Run each service schema in its own database:

- `User-Service/schema.sql`
- `Cart-Service/schema.sql`

## Environment

Create `.env` in each service from `.env.example`:

- `User-Service/.env` (already exists in this workspace)
- `Cart-Service/.env`

## Main APIs
### User-Service

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/session`
- `POST /users` (`admin` only)
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`

### Cart-Service

- `GET /carts/me` (authenticated user)
- `POST /carts/me/items` (authenticated user, body: `productId`, `productName`, `unitPrice`, `quantity`)
- `GET /carts/:userId` (owner or admin)

## Future Features

- `API Gateway`: single entry point, routing, auth forwarding, request validation, rate limit.
- `Notification-Service`: email/SMS/push notifications (order updates, password reset, welcome events).

Suggested future improvements:

- `Payment-Service` integration (Stripe/Paymob) with payment events.
- `Inventory-Service` with stock reservation and release on order timeout/cancel.
- `Search-Service` (Elasticsearch/OpenSearch) for product discovery.
- `Audit/Activity Service` for admin actions and critical domain events.
- Centralized tracing/logging stack (OpenTelemetry + Grafana/Prometheus + ELK).

## Run

Install dependencies per service, then run each one:

```bash
cd User-Service && npm install && npm run dev
cd Cart-Service && npm install && npm run dev
```
