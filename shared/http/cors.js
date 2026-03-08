const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:4200",
  "http://127.0.0.1:4200",
]);

const DEFAULT_ALLOWED_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const DEFAULT_ALLOWED_HEADERS = Object.freeze([
  "Authorization",
  "Content-Type",
  "X-Requested-With",
  "X-Request-Id",
  "X-Audit-Token",
]);

const DEFAULT_EXPOSED_HEADERS = Object.freeze([
  "X-Request-Id",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "Retry-After",
]);

const toBoolean = (value, fallback = false) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
};

const toPositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
};

const parseCommaSeparatedList = (value, fallback) => {
  if (typeof value !== "string" || !value.trim()) return [...fallback];
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parsed.length === 0) return [...fallback];
  return parsed;
};

const normalizeOrigin = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed === "*") return "*";

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_error) {
    return trimmed.replace(/\/+$/, "");
  }
};

const resolveCorsSettings = (env = process.env) => {
  const requestedOrigins = parseCommaSeparatedList(
    env.CORS_ALLOWED_ORIGINS,
    DEFAULT_ALLOWED_ORIGINS,
  );

  const normalizedOrigins = requestedOrigins
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  const allowAnyOrigin = normalizedOrigins.includes("*");
  const allowedOrigins = allowAnyOrigin
    ? ["*"]
    : [...new Set(normalizedOrigins)];
  const allowedOriginSet = new Set(allowedOrigins);

  const allowCredentials =
    !allowAnyOrigin && toBoolean(env.CORS_ALLOW_CREDENTIALS, true);
  const methods = parseCommaSeparatedList(
    env.CORS_ALLOWED_METHODS,
    DEFAULT_ALLOWED_METHODS,
  ).map((method) => method.toUpperCase());
  const allowedHeaders = parseCommaSeparatedList(
    env.CORS_ALLOWED_HEADERS,
    DEFAULT_ALLOWED_HEADERS,
  );
  const exposedHeaders = parseCommaSeparatedList(
    env.CORS_EXPOSED_HEADERS,
    DEFAULT_EXPOSED_HEADERS,
  );
  const maxAgeSeconds = toPositiveNumber(env.CORS_MAX_AGE_SECONDS, 86400);

  return {
    options: {
      origin: (origin, callback) => {
        if (!origin || allowAnyOrigin) {
          callback(null, true);
          return;
        }

        const normalizedOrigin = normalizeOrigin(origin);
        callback(null, Boolean(normalizedOrigin && allowedOriginSet.has(normalizedOrigin)));
      },
      credentials: allowCredentials,
      methods,
      allowedHeaders,
      exposedHeaders,
      maxAge: maxAgeSeconds,
      optionsSuccessStatus: 204,
    },
    metadata: {
      allowAnyOrigin,
      allowedOrigins,
      allowCredentials,
      methods,
      allowedHeaders,
      exposedHeaders,
      maxAgeSeconds,
    },
  };
};

module.exports = {
  resolveCorsSettings,
};
