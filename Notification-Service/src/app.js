require("dotenv").config();
const express = require("express");
const cors = require("cors");
const notificationRoutes = require("./routes/notification.routes");
const db = require("./config/db");
const { connectConsumer, disconnectConsumer } = require("./config/kafka");
const {
  startNotificationEventsConsumer,
} = require("./events/notificationEvents.consumer");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { resolveCorsSettings } = require("../../shared/http/cors");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const port = Number(process.env.PORT) || 3008;
let server;
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("notification-service");
const { options: corsOptions } = resolveCorsSettings(process.env);

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cors(corsOptions));
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

app.use("/notifications", notificationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await db.initializeDatabase();
  await connectConsumer();
  await startNotificationEventsConsumer();

  server = app.listen(port, () => {
    console.log(`Notification Service running on port ${port}`);
  });
};

const shutdown = async (signal) => {
  console.log(`[notification-service] ${signal} received, shutting down`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    await disconnectConsumer();
    process.exit(0);
  } catch (err) {
    console.error("[notification-service] graceful shutdown failed", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((err) => {
  console.error("[notification-service] failed to start", err);
  process.exit(1);
});
