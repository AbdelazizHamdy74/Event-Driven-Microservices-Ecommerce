# MicroCommerce

Event-Driven Microservices E-commerce Platform

MicroCommerce is a backend e-commerce platform built with Node.js, Express,
Kafka, and MySQL. The system is designed to be scalable, loosely coupled, and
event-driven.

---

## Architecture Overview

Services:

- User Service (`3001`)
- Cart Service (`3002`)
- Order Service (`3003`)
- Product Service (`3004`)

Each service:

- Owns its own database schema
- Communicates asynchronously via Kafka events where needed
- Can be deployed independently
- Exposes `GET /health` and `GET /metrics`

Integration notes:

- User Service publishes `USER_CREATED` on Kafka topic `user-events`
- Cart Service and Order Service consume `user-events` and create local user projections
- Cart Service calls Product Service internal API `GET /internal/products/:id` before adding cart items
- Order Service calls Cart Service `GET /carts/me` and creates an order only if the selected product already exists in the user's cart

---

## Event-Driven Flow (Kafka)

Published events:

- `USER_CREATED`

Kafka topic consumers:

- `user-events` -> Cart Service
- `user-events` -> Order Service

`USER_CREATED` payload example:

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

---

## Service Endpoints

### User Service (`http://localhost:3001`)

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password/otp`
- `POST /auth/reset-password` (authenticated)
- `GET /auth/session` (authenticated)
- `GET /auth/users` (admin)
- `POST /users` (admin)
- `GET /users/:id` (authenticated)
- `PUT /users/:id` (owner or admin)
- `DELETE /users/:id` (owner or admin)

### Cart Service (`http://localhost:3002`)

- `GET /carts/me` (authenticated user)
- `POST /carts/me/items` (authenticated `user`, body: `productId`, `quantity`)
- `GET /carts/:userId` (owner or admin)

### Order Service (`http://localhost:3003`)

- `POST /orders/me` (authenticated `user`, body: `productId`, optional `quantity`; product must exist in user cart)
- `GET /orders/me` (authenticated user)
- `GET /orders/:orderId` (owner or admin)
- `PATCH /orders/:orderId/cancel` (owner or admin, only while order status is `pending`)
- `PATCH /orders/:orderId/status` (admin only, body: `status` = `paid` | `shipped` | `delivered` | `cancelled`)
- `GET /orders/user/:userId` (owner or admin)

Order Service env vars:

- `CART_SERVICE_URL` (default: `http://localhost:3002`)
- `CART_TIMEOUT_MS` (default: `4000`)

Order lifecycle values in schema:

- `pending`
- `paid`
- `shipped`
- `delivered`
- `cancelled`

Allowed status transitions for admin route:

- `pending` -> `paid` or `cancelled`
- `paid` -> `shipped` or `cancelled`
- `shipped` -> `delivered`

### Product Service (`http://localhost:3004`)

- `GET /categories`
- `POST /categories` (`admin` only)
- `GET /products`
- `GET /products/:id`
- `POST /products` (`admin` or `supplier`)
- `GET /internal/products/:id` (service-to-service endpoint used by Cart Service)

Internal services remain available on their own ports for service-to-service calls.

---

## Monitoring, Logging, and Runtime Safety (Implemented)

Applied to all HTTP services:

- User Service
- Cart Service
- Order Service
- Product Service

### Observability

- Request logging with method, path, status, duration, and request id
- Response header `X-Request-Id`
- `GET /health` for liveness checks
- `GET /metrics` for lightweight runtime counters and memory usage

### Rate Limiting

- Per-IP in-memory rate limiter
- Response headers:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
- `Retry-After` header on throttled requests
- `429` JSON response when exceeded

Environment variables:

- `RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RATE_LIMIT_MAX` (default: `120`)

### Security Enhancements

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Cross-Origin-Resource-Policy: same-site`
- `x-powered-by` disabled

### Error Handling and 404

- Unified JSON error responses through global error middleware
- Invalid token errors are returned as `401` JSON
- Unknown routes return JSON `404`

Example `404` response:

```json
{
  "message": "Route not found: GET /unknown-route"
}
```

---

## Security

- JWT authentication
- Role-based authorization
- Middleware-based access control
- Consistent JSON error responses
- Basic secure HTTP headers
- Rate limiting

---

## Tech Stack

- Node.js
- Express.js
- Apache Kafka
- MySQL
- JWT

---

## Database Schemas

Apply each service schema in its own database:

- `User-Service/schema.sql`
- `Cart-Service/schema.sql`
- `Order-Service/schema.sql`
- `Product-Service/schema.sql`

---

## Future Features

- API Gateway as a single entry point for routing and auth forwarding
- Notification Service for email/SMS/push updates
- Payment Service integration (Stripe/Paymob) with payment events
- Inventory Service with stock reservation and release on order timeout/cancel
- Search Service (Elasticsearch/OpenSearch) for product discovery
- Audit/Activity Service for admin actions and critical domain events
- Centralized tracing/logging stack (OpenTelemetry + Grafana/Prometheus + ELK)

---

## Running the Project

1. Start Kafka and Zookeeper.
2. Ensure MySQL is running.
3. Create service databases and apply each `schema.sql`.
4. Create `.env` in each service:
   - `User-Service/.env`
   - `Cart-Service/.env`
   - `Order-Service/.env`
   - `Product-Service/.env`
5. Run HTTP services:
   - `User-Service`
   - `Cart-Service`
   - `Order-Service`
   - `Product-Service`
6. Verify health checks:
   - `GET http://localhost:3001/health`
   - `GET http://localhost:3002/health`
   - `GET http://localhost:3003/health`
   - `GET http://localhost:3004/health`

Run commands:

```bash
cd User-Service && npm install && npm run dev
cd Cart-Service && npm install && npm run dev
cd Order-Service && npm install && npm run dev
cd Product-Service && npm install && npm run dev
```
