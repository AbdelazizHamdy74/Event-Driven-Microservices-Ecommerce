require("dotenv").config();
const express = require("express");
const cors = require("cors");
const paymentRoutes = require("./routes/payment.routes");
const internalRoutes = require("./routes/internal.routes");
const {
  connectProducer,
  disconnectProducer,
  connectConsumer,
  disconnectConsumer,
} = require("./config/kafka");
const { startUserEventsConsumer } = require("./events/userEvents.consumer");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const port = Number(process.env.PORT) || 3007;
let server;
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("payment-service");

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

app.use("/payments", paymentRoutes);
app.use("/internal", internalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await connectProducer();
  await connectConsumer();
  await startUserEventsConsumer();

  server = app.listen(port, () => {
    console.log(`Payment Service running on port ${port}`);
  });
};

const shutdown = async (signal) => {
  console.log(`[payment-service] ${signal} received, shutting down`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    await disconnectConsumer();
    await disconnectProducer();
    process.exit(0);
  } catch (err) {
    console.error("[payment-service] graceful shutdown failed", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((err) => {
  console.error("[payment-service] failed to start", err);
  process.exit(1);
});
