require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectConsumer, disconnectConsumer } = require("./config/kafka");
const { startUserEventsConsumer } = require("./events/userEvents.consumer");
const cartRoutes = require("./routes/cart.routes");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const port = Number(process.env.PORT) || 3002;
let server;
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("cart-service");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cors());
app.use(securityHeaders);
app.use(
  createRateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: Number(process.env.RATE_LIMIT_MAX) || 120,
  }),
);
app.use(requestLogger);

app.get("/health", healthHandler);
app.get("/metrics", metricsHandler);

app.use("/carts", cartRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await connectConsumer();
  await startUserEventsConsumer();

  server = app.listen(port, () => {
    console.log(`Cart Service running on port ${port}`);
  });
};

const shutdown = async (signal) => {
  console.log(`[cart-service] ${signal} received, shutting down`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    await disconnectConsumer();
    process.exit(0);
  } catch (err) {
    console.error("[cart-service] graceful shutdown failed", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((err) => {
  console.error("[cart-service] failed to start", err);
  process.exit(1);
});
