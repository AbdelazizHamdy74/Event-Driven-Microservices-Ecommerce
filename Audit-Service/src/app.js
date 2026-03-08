require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./config/db");
const auditRoutes = require("./routes/audit.routes");
const internalRoutes = require("./routes/internal.routes");
const { connectConsumer, disconnectConsumer } = require("./config/kafka");
const { startDomainEventsConsumer } = require("./events/domainEvents.consumer");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { resolveCorsSettings } = require("../../shared/http/cors");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const port = Number(process.env.PORT) || 3009;
let server;
const { requestLogger, healthHandler, metricsHandler } = createObservability(
  "audit-service",
  {
    disableAuditActivity: true,
  },
);
const { options: corsOptions } = resolveCorsSettings(process.env);

app.disable("x-powered-by");
app.use(express.json({ limit: "300kb" }));
app.use(cors(corsOptions));
app.use(securityHeaders);
const rateLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.RATE_LIMIT_MAX) || 120,
});
app.use((req, res, next) => {
  if (req.path === "/internal/audit-logs") {
    next();
    return;
  }

  rateLimiter(req, res, next);
});
app.use(requestLogger);

app.get("/health", healthHandler);
app.get("/metrics", metricsHandler);

app.use("/audit", auditRoutes);
app.use("/internal", internalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await db.initializeDatabase();
  await connectConsumer();
  await startDomainEventsConsumer();

  server = app.listen(port, () => {
    console.log(`Audit Service running on port ${port}`);
  });
};

const shutdown = async (signal) => {
  console.log(`[audit-service] ${signal} received, shutting down`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    await disconnectConsumer();
    process.exit(0);
  } catch (err) {
    console.error("[audit-service] graceful shutdown failed", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((err) => {
  console.error("[audit-service] failed to start", err);
  process.exit(1);
});
