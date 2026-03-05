const normalizeServiceUrl = (value, fallback) => {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;
  try {
    const parsed = new URL(candidate);
    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    return fallback;
  }
};

const toPositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
};

const env = {
  port: toPositiveNumber(process.env.PORT, 3010),
  authTimeoutMs: toPositiveNumber(process.env.AUTH_TIMEOUT_MS, 3000),
  proxyTimeoutMs: toPositiveNumber(process.env.GATEWAY_PROXY_TIMEOUT_MS, 8000),
  rateLimitWindowMs: toPositiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: toPositiveNumber(process.env.RATE_LIMIT_MAX, 120),
  exposeInternalRoutes: toBoolean(process.env.EXPOSE_INTERNAL_ROUTES, false),
  serviceUrls: {
    user: normalizeServiceUrl(process.env.USER_SERVICE_URL, "http://localhost:3001"),
    cart: normalizeServiceUrl(process.env.CART_SERVICE_URL, "http://localhost:3002"),
    order: normalizeServiceUrl(process.env.ORDER_SERVICE_URL, "http://localhost:3003"),
    product: normalizeServiceUrl(
      process.env.PRODUCT_SERVICE_URL,
      "http://localhost:3004",
    ),
    inventory: normalizeServiceUrl(
      process.env.INVENTORY_SERVICE_URL,
      "http://localhost:3005",
    ),
    search: normalizeServiceUrl(process.env.SEARCH_SERVICE_URL, "http://localhost:3006"),
    payment: normalizeServiceUrl(process.env.PAYMENT_SERVICE_URL, "http://localhost:3007"),
    notification: normalizeServiceUrl(
      process.env.NOTIFICATION_SERVICE_URL,
      "http://localhost:3008",
    ),
    audit: normalizeServiceUrl(process.env.AUDIT_SERVICE_URL, "http://localhost:3009"),
  },
};

module.exports = { env };
