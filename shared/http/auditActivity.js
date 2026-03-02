const http = require("http");
const https = require("https");

const DEFAULT_AUDIT_SERVICE_URL = "http://localhost:3009";
const DEFAULT_TIMEOUT_MS = 800;

const toTrimmedText = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const toPositiveNumber = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return normalized;
};

const toNormalizedPath = (value) => {
  if (typeof value !== "string" || !value.trim()) return "/";
  const withoutQuery = value.split("?")[0].trim();
  if (!withoutQuery) return "/";
  if (withoutQuery.startsWith("/")) {
    return withoutQuery.slice(0, 255);
  }

  return `/${withoutQuery}`.slice(0, 255);
};

const toHeaderValue = (value, maxLength) => {
  if (Array.isArray(value)) {
    return toTrimmedText(value[0], maxLength);
  }

  return toTrimmedText(value, maxLength);
};

const toActorPayload = (user) => {
  if (!user || typeof user !== "object") return null;

  const userId = toPositiveNumber(user.userId || user.id);
  const role =
    toTrimmedText(typeof user.role === "string" ? user.role.toLowerCase() : "", 20) ||
    (userId ? "user" : "anonymous");

  if (!userId && role === "anonymous") {
    return null;
  }

  return {
    userId,
    role,
  };
};

const resolveClientIp = (req) => {
  const forwarded = toHeaderValue(req.headers["x-forwarded-for"], 255);
  if (forwarded) {
    const firstHop = forwarded.split(",")[0];
    return toTrimmedText(firstHop, 120);
  }

  const remoteAddress =
    toTrimmedText(req.socket?.remoteAddress, 120) ||
    toTrimmedText(req.ip, 120) ||
    null;

  return remoteAddress;
};

const resolveEndpoint = () => {
  const baseUrl =
    toTrimmedText(process.env.AUDIT_SERVICE_URL, 500) || DEFAULT_AUDIT_SERVICE_URL;
  try {
    return new URL("/internal/audit-logs", baseUrl);
  } catch (_error) {
    return null;
  }
};

const shouldSkipActivityLog = (serviceName, path) => {
  if (process.env.AUDIT_ACTIVITY_ENABLED === "false") return true;
  if (serviceName === "audit-service") return true;
  if (path === "/health" || path === "/metrics") return true;
  if (path === "/internal/audit-logs") return true;
  return false;
};

const buildActivityPayload = ({
  serviceName,
  req,
  statusCode,
  durationMs,
  requestId,
}) => {
  const method = toTrimmedText(req.method, 10) || "GET";
  const path = toNormalizedPath(req.originalUrl || req.url);
  const actor = toActorPayload(req.user);
  const isAdminAction = actor?.role === "admin";
  const normalizedStatusCode =
    Number.isInteger(Number(statusCode)) && Number(statusCode) > 0
      ? Number(statusCode)
      : null;

  return {
    serviceName: toTrimmedText(serviceName, 80) || "unknown-service",
    action: `${method} ${path}`.slice(0, 180),
    actor,
    severity:
      normalizedStatusCode >= 500
        ? "critical"
        : normalizedStatusCode >= 400
          ? "warning"
          : "info",
    http: {
      method,
      path,
      statusCode: normalizedStatusCode,
      requestId: toTrimmedText(requestId, 64),
      durationMs:
        Number.isFinite(Number(durationMs)) && Number(durationMs) >= 0
          ? Number(Number(durationMs).toFixed(3))
          : null,
    },
    metadata: {
      queryKeys:
        req.query && typeof req.query === "object"
          ? Object.keys(req.query).slice(0, 25)
          : [],
      paramKeys:
        req.params && typeof req.params === "object"
          ? Object.keys(req.params).slice(0, 25)
          : [],
      bodyKeys:
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? Object.keys(req.body).slice(0, 40)
          : [],
      userAgent: toHeaderValue(req.headers["user-agent"], 255),
      ip: resolveClientIp(req),
      isAdminAction,
    },
    occurredAt: new Date().toISOString(),
  };
};

const publishActivityLog = ({
  serviceName,
  req,
  statusCode,
  durationMs,
  requestId,
}) =>
  new Promise((resolve) => {
    const path = toNormalizedPath(req.originalUrl || req.url);
    if (shouldSkipActivityLog(serviceName, path)) {
      resolve(false);
      return;
    }

    const endpoint = resolveEndpoint();
    if (!endpoint) {
      resolve(false);
      return;
    }

    const payload = buildActivityPayload({
      serviceName,
      req,
      statusCode,
      durationMs,
      requestId,
    });
    const body = JSON.stringify(payload);
    const timeoutMs = Number(process.env.AUDIT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const transport = endpoint.protocol === "https:" ? https : http;
    const headers = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    };

    const internalToken = toTrimmedText(process.env.AUDIT_INTERNAL_TOKEN, 200);
    if (internalToken) {
      headers["x-audit-token"] = internalToken;
    }

    const request = transport.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port:
          Number(endpoint.port) || (endpoint.protocol === "https:" ? 443 : 80),
        method: "POST",
        path: `${endpoint.pathname}${endpoint.search}`,
        headers,
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolve(response.statusCode >= 200 && response.statusCode < 300);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Audit service timeout"));
    });

    request.on("error", () => {
      resolve(false);
    });

    request.write(body);
    request.end();
  });

module.exports = {
  publishActivityLog,
};
