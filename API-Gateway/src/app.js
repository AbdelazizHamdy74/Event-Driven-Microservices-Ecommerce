require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { resolveCorsSettings } = require("../../shared/http/cors");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");
const { env } = require("./config/env");
const { buildFrontendCatalog } = require("./config/frontendCatalog");
const { createAuthForwardingMiddleware } = require("./middlewares/authForwarding.middleware");
const { createProxyMiddleware } = require("./middlewares/proxy.middleware");

const app = express();
let server;
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("api-gateway");
const { options: corsOptions, metadata: corsMetadata } = resolveCorsSettings(
  process.env,
);

app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "300kb" }));
app.use(cors(corsOptions));
app.use(securityHeaders);
app.use(
  createRateLimiter({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
  }),
);
app.use(requestLogger);

app.get("/health", healthHandler);
app.get("/metrics", metricsHandler);
app.get("/frontend/catalog", (req, res) => {
  const host = req.get("host") || `localhost:${env.port}`;
  res.json(
    buildFrontendCatalog({
      port: env.port,
      runtimeBaseUrl: `${req.protocol}://${host}`,
      exposeInternalRoutes: env.exposeInternalRoutes,
      cors: corsMetadata,
    }),
  );
});

app.use(
  createAuthForwardingMiddleware({
    userServiceUrl: env.serviceUrls.user,
    authTimeoutMs: env.authTimeoutMs,
  }),
);
app.use(
  createProxyMiddleware({
    serviceUrls: env.serviceUrls,
    proxyTimeoutMs: env.proxyTimeoutMs,
    exposeInternalRoutes: env.exposeInternalRoutes,
  }),
);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  server = app.listen(env.port, () => {
    console.log(`API Gateway running on port ${env.port}`);
  });
};

const shutdown = async (signal) => {
  console.log(`[api-gateway] ${signal} received, shutting down`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    process.exit(0);
  } catch (err) {
    console.error("[api-gateway] graceful shutdown failed", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((err) => {
  console.error("[api-gateway] failed to start", err);
  process.exit(1);
});
