# MicroCommerce

Event-Driven Microservices E-commerce Platform

MicroCommerce is a backend e-commerce platform built with Node.js, Express,
Kafka, and MySQL. The system is designed to be scalable, loosely coupled, and
event-driven.

---

## Architecture Overview

Services:

- API Gateway (`3000`)
- User Service (`3001`)
- Cart Service (`3002`)
- Order Service (`3003`)
- Product Service (`3004`)
- Inventory Service (`3005`)
- Search Service (`3006`)
- Payment Service (`3007`)
- Notification Service (`3008`)
- Audit Service (`3009`)

Each service:

- Owns its own database schema
- Communicates asynchronously via Kafka events where needed
- Can be deployed independently
- Exposes `GET /health` and `GET /metrics`

Integration notes:

- API Gateway is the single external entry point, routes requests to downstream services, validates protected sessions, and forwards auth/user context headers
- User Service publishes `USER_CREATED` on Kafka topic `user-events`
- Cart Service, Order Service, Payment Service, and Notification Service consume `user-events` and create local user projections
- Cart Service calls Product Service internal API `GET /internal/products/:id` before adding cart items
- Order Service calls Cart Service `GET /carts/me` and creates an order only if the selected product already exists in the user's cart
- Order Service reserves stock in Inventory Service at order creation
- Order cancel flow releases reserved stock in Inventory Service
- Order transition to `shipped` confirms reservation and deducts stock in Inventory Service
- Product creation syncs initial stock to Inventory Service
- Product creation upserts product document in Search Service
- Payment Service validates order existence via Order Service internal API and marks order as `paid` after successful charge
- Payment Service publishes payment lifecycle events to Kafka topic `payment-events`
- Notification Service consumes `payment-events` and stores delivery records for `email`, `sms`, and `push` channels
- Audit Service consumes `user-events` and `payment-events`, and all services forward HTTP activity/admin actions to Audit Service via `/internal/audit-logs`

---

## Event-Driven Flow (Kafka)

Published events:

- `USER_CREATED`
- `PAYMENT_CREATED`
- `PAYMENT_SUCCEEDED`
- `PAYMENT_FAILED`

Kafka topic consumers:

- `user-events` -> Cart Service
- `user-events` -> Order Service
- `user-events` -> Payment Service
- `user-events` -> Notification Service
- `user-events` -> Audit Service
- `payment-events` -> Notification Service
- `payment-events` -> Audit Service

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

`PAYMENT_SUCCEEDED` payload example:

```json
{
  "eventId": "uuid",
  "eventType": "PAYMENT_SUCCEEDED",
  "eventVersion": 1,
  "occurredAt": "2026-02-23T10:30:00.000Z",
  "producer": "payment-service",
  "data": {
    "paymentId": 12,
    "orderId": 101,
    "userId": 7,
    "provider": "stripe",
    "providerPaymentId": "pi_123456",
    "status": "succeeded",
    "currency": "USD",
    "amount": 89.99,
    "failureReason": null,
    "orderSync": {
      "ok": true,
      "status": 200,
      "fromExistingPayment": false
    }
  }
}
```

---

## Service Endpoints

### API Gateway (`http://localhost:3000`)

- Public API entry point for all client-facing routes:
  - User/Auth: `/auth/*`, `/users/*`
  - Cart: `/carts/*`
  - Order: `/orders/*`
  - Product/Categories: `/products/*`, `/categories/*`
  - Inventory: `/inventory/*`
  - Search: `/search/*`
  - Payment: `/payments/*`
  - Notification: `/notifications/*`
  - Audit (read): `/audit/*`
- `GET /health`
- `GET /metrics`
- Internal routes containing `/internal` are blocked by default (`EXPOSE_INTERNAL_ROUTES=false`)

API Gateway env vars:

- `PORT` (default: `3000`)
- `USER_SERVICE_URL` (default: `http://localhost:3001`)
- `CART_SERVICE_URL` (default: `http://localhost:3002`)
- `ORDER_SERVICE_URL` (default: `http://localhost:3003`)
- `PRODUCT_SERVICE_URL` (default: `http://localhost:3004`)
- `INVENTORY_SERVICE_URL` (default: `http://localhost:3005`)
- `SEARCH_SERVICE_URL` (default: `http://localhost:3006`)
- `PAYMENT_SERVICE_URL` (default: `http://localhost:3007`)
- `NOTIFICATION_SERVICE_URL` (default: `http://localhost:3008`)
- `AUDIT_SERVICE_URL` (default: `http://localhost:3009`)
- `AUTH_TIMEOUT_MS` (default: `3000`)
- `GATEWAY_PROXY_TIMEOUT_MS` (default: `8000`)
- `EXPOSE_INTERNAL_ROUTES` (default: `false`)

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
- `GET /internal/orders/:orderId/exists` (service-to-service existence check)
- `POST /internal/orders/:orderId/mark-paid` (service-to-service endpoint used by Payment Service)

Order Service env vars:

- `CART_SERVICE_URL` (default: `http://localhost:3002`)
- `CART_TIMEOUT_MS` (default: `4000`)
- `INVENTORY_SERVICE_URL` (default: `http://localhost:3005`)
- `INVENTORY_TIMEOUT_MS` (default: `4000`)
- `INVENTORY_RESERVATION_TTL_SECONDS` (default: `900`)

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
- `GET /internal/products/:id/exists` (service-to-service existence check)

Product Service sync integrations:

- Inventory Service: initializes stock at product creation
- Search Service: upserts product search document at product creation

Product Service env vars:

- `INVENTORY_SERVICE_URL` (default: `http://localhost:3005`)
- `INVENTORY_TIMEOUT_MS` (default: `4000`)
- `SEARCH_SERVICE_URL` (default: `http://localhost:3006`)
- `SEARCH_TIMEOUT_MS` (default: `4000`)

### Inventory Service (`http://localhost:3005`)

- `GET /inventory/:productId`
- `PUT /inventory/:productId/stock` (`admin` or `supplier`, body: `totalQuantity`)
- `POST /internal/reservations` (internal, body: `orderId`, `productId`, `quantity`, optional `expiresAt`)
- `POST /internal/reservations/:reservationId/release` (internal, optional body: `reason`)
- `POST /internal/orders/:orderId/release` (internal, optional body: `reason`)
- `POST /internal/orders/:orderId/confirm` (internal)
- `POST /internal/reservations/release-expired` (internal)

Inventory timeout sweep env var:

- `RESERVATION_SWEEP_INTERVAL_MS` (default: `60000`)
- `ORDER_SERVICE_URL` (default: `http://localhost:3003`)
- `ORDER_TIMEOUT_MS` (default: `3000`)
- `PRODUCT_SERVICE_URL` (default: `http://localhost:3004`)
- `PRODUCT_TIMEOUT_MS` (default: `3000`)

### Search Service (`http://localhost:3006`)

- `GET /search/products` (query: `q`, `categoryId`, `minPrice`, `maxPrice`, `inStock`, `page`, `pageSize`)
- `PUT /internal/products/:productId` (`admin` or `supplier`, upsert indexed document)
- `DELETE /internal/products/:productId` (`admin` or `supplier`, remove indexed document)

Search Service currently uses a MySQL-backed index table and is structured to be replaceable by Elasticsearch/OpenSearch later.

### Payment Service (`http://localhost:3007`)

- `POST /payments/me/orders/:orderId/charge` (authenticated `user`, body: optional `provider` = `stripe` | `paymob`, optional `paymentMethod`, optional `paymentToken`, optional `metadata`)
- `GET /payments/me` (authenticated user)
- `GET /payments/:paymentId` (owner or admin)
- `GET /internal/orders/:orderId/payments` (service-to-service payment lookup)

Payment Service integrations:

- Order Service: verifies order with `GET /internal/orders/:orderId/exists`
- Order Service: sets order status to paid with `POST /internal/orders/:orderId/mark-paid`
- Kafka: publishes `PAYMENT_CREATED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED` on `payment-events`

Payment Service env vars:

- `ORDER_SERVICE_URL` (default: `http://localhost:3003`)
- `ORDER_TIMEOUT_MS` (default: `4000`)
- `PAYMENT_PROVIDER` (default: `stripe`, allowed: `stripe` | `paymob`)
- `PAYMENT_PROVIDER_DELAY_MS` (default: `0`)
- `KAFKA_PAYMENT_EVENTS_TOPIC` (default: `payment-events`)
- `KAFKA_USER_EVENTS_TOPIC` (default: `user-events`)
- `AUTH_TIMEOUT_MS` (default: `3000`)

### Notification Service (`http://localhost:3008`)

- `GET /notifications/me` (authenticated user, optional query: `limit`)
- `PATCH /notifications/me/:notificationId/read` (authenticated user)
- `GET /notifications/user/:userId` (owner or admin, optional query: `limit`)

Notification Service integrations:

- Kafka `user-events`: consumes `USER_CREATED` and upserts notification user projections
- Kafka `payment-events`: consumes `PAYMENT_CREATED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED` and creates channel notifications (`email`, `sms`, `push`)

Notification Service env vars:

- `KAFKA_USER_EVENTS_TOPIC` (default: `user-events`)
- `KAFKA_PAYMENT_EVENTS_TOPIC` (default: `payment-events`)
- `NOTIFICATION_CHANNELS` (default: `email,sms,push`)
- `USER_SERVICE_URL` (default: `http://localhost:3001`)
- `AUTH_TIMEOUT_MS` (default: `3000`)

### Audit Service (`http://localhost:3009`)

- `GET /audit/logs` (admin only, query: `page`, `limit`, `logType`, `serviceName`, `actorUserId`, `actorRole`, `severity`, `httpMethod`, `httpStatus`, `eventType`, `from`, `to`, `q`)
- `GET /audit/logs/me` (authenticated user, query filters supported)
- `POST /internal/audit-logs` (internal activity ingest endpoint used by all services)

Audit Service integrations:

- Kafka `user-events`: consumes domain events (`USER_CREATED`, and future user domain events)
- Kafka `payment-events`: consumes payment domain events (`PAYMENT_CREATED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`)
- HTTP activity stream: receives request/activity records from all services through shared observability middleware

Audit Service env vars:

- `KAFKA_USER_EVENTS_TOPIC` (default: `user-events`)
- `KAFKA_PAYMENT_EVENTS_TOPIC` (default: `payment-events`)
- `KAFKA_AUDIT_EXTRA_TOPICS` (optional comma-separated topic list)
- `USER_SERVICE_URL` (default: `http://localhost:3001`)
- `AUTH_TIMEOUT_MS` (default: `3000`)
- `AUDIT_INTERNAL_TOKEN` (optional shared token for `/internal/audit-logs`)

Client traffic should go through `http://localhost:3000`, while internal services remain available on their own ports for service-to-service calls.

---

## Monitoring, Logging, and Runtime Safety (Implemented)

Applied to all HTTP services:

- API Gateway
- User Service
- Cart Service
- Order Service
- Product Service
- Inventory Service
- Search Service
- Payment Service
- Notification Service
- Audit Service

### Observability

- Request logging with method, path, status, duration, and request id
- Response header `X-Request-Id`
- `GET /health` for liveness checks
- `GET /metrics` for lightweight runtime counters and memory usage
- Automatic activity forwarding to Audit Service (`POST /internal/audit-logs`) for admin actions and request-level activity trail

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
- `AUDIT_SERVICE_URL` (default: `http://localhost:3009`)
- `AUDIT_ACTIVITY_ENABLED` (default: `true`)
- `AUDIT_TIMEOUT_MS` (default: `800`)
- `AUDIT_INTERNAL_TOKEN` (optional; if set it is sent as `x-audit-token`)

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
- `Inventory-Service/schema.sql`
- `Search-Service/schema.sql`
- `Payment-Service/schema.sql`
- `Notification-Service/schema.sql`
- `Audit-Service/schema.sql`

---

## Future Features

- Centralized tracing/logging stack (OpenTelemetry + Grafana/Prometheus + ELK)
- Fraud/Risk scoring workflow for suspicious orders and payments

---

## Running the Project

1. Start Kafka and Zookeeper.
2. Ensure MySQL is running.
3. Create service databases and apply each `schema.sql`.
4. Create `.env` in each service:

   - `API-Gateway/.env` (you can copy from `API-Gateway/.env.example`)
   - `User-Service/.env`
   - `Cart-Service/.env`
   - `Order-Service/.env`
   - `Product-Service/.env`
   - `Inventory-Service/.env`
   - `Search-Service/.env`
   - `Payment-Service/.env`
   - `Notification-Service/.env`
   - `Audit-Service/.env`
5. Run HTTP services:

   - `API-Gateway`
   - `User-Service`
   - `Cart-Service`
   - `Order-Service`
   - `Product-Service`
   - `Inventory-Service`
   - `Search-Service`
   - `Payment-Service`
   - `Notification-Service`
   - `Audit-Service`
6. Verify health checks:

   - `GET http://localhost:3000/health`
   - `GET http://localhost:3001/health`
   - `GET http://localhost:3002/health`
   - `GET http://localhost:3003/health`
   - `GET http://localhost:3004/health`
   - `GET http://localhost:3005/health`
   - `GET http://localhost:3006/health`
   - `GET http://localhost:3007/health`
   - `GET http://localhost:3008/health`
   - `GET http://localhost:3009/health`

Run commands:

```bash
cd API-Gateway && npm install && npm run dev
cd User-Service && npm install && npm run dev
cd Cart-Service && npm install && npm run dev
cd Order-Service && npm install && npm run dev
cd Product-Service && npm install && npm run dev
cd Inventory-Service && npm install && npm run dev
cd Search-Service && npm install && npm run dev
cd Payment-Service && npm install && npm run dev
cd Notification-Service && npm install && npm run dev
cd Audit-Service && npm install && npm run dev
```
