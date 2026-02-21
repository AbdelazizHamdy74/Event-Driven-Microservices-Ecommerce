require("dotenv").config();
const express = require("express");
const cors = require("cors");
const inventoryRoutes = require("./routes/inventory.routes");
const internalRoutes = require("./routes/internal.routes");
const { releaseExpiredReservations } = require("./services/inventory.service");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const port = Number(process.env.PORT) || 3005;
const reservationSweepIntervalMs =
  Number(process.env.RESERVATION_SWEEP_INTERVAL_MS) || 60000;
let server;
let reservationSweepTimer = null;
let reservationSweepInProgress = false;
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("inventory-service");

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

app.use("/inventory", inventoryRoutes);
app.use("/internal", internalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  server = app.listen(port, () => {
    console.log(`Inventory Service running on port ${port}`);
  });

  if (reservationSweepIntervalMs > 0) {
    reservationSweepTimer = setInterval(async () => {
      if (reservationSweepInProgress) return;
      reservationSweepInProgress = true;

      try {
        const result = await releaseExpiredReservations();
        if (result.expiredCount > 0) {
          console.log(
            `[inventory-service] released expired reservations count=${result.expiredCount} quantity=${result.expiredQuantity}`,
          );
        }
      } catch (err) {
        console.error(
          "[inventory-service] failed to release expired reservations",
          err,
        );
      } finally {
        reservationSweepInProgress = false;
      }
    }, reservationSweepIntervalMs);

    if (typeof reservationSweepTimer.unref === "function") {
      reservationSweepTimer.unref();
    }
  }
};

const shutdown = async (signal) => {
  console.log(`[inventory-service] ${signal} received, shutting down`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (reservationSweepTimer) {
      clearInterval(reservationSweepTimer);
      reservationSweepTimer = null;
    }

    process.exit(0);
  } catch (err) {
    console.error("[inventory-service] graceful shutdown failed", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((err) => {
  console.error("[inventory-service] failed to start", err);
  process.exit(1);
});
