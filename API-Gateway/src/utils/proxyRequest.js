const http = require("http");
const https = require("https");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const toSingleHeaderValue = (value) => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const toPositiveNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const buildForwardedFor = (existingValue, remoteAddress) => {
  const prior = typeof existingValue === "string" ? existingValue.trim() : "";
  const current = typeof remoteAddress === "string" ? remoteAddress.trim() : "";
  if (prior && current) return `${prior}, ${current}`;
  if (prior) return prior;
  if (current) return current;
  return "unknown";
};

const buildUpstreamHeaders = (req) => {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerCaseKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerCaseKey)) continue;
    if (lowerCaseKey === "host") continue;
    if (lowerCaseKey === "content-length") continue;
    headers[lowerCaseKey] = value;
  }

  headers["x-forwarded-host"] = toSingleHeaderValue(req.headers.host) || "";
  headers["x-forwarded-proto"] = req.protocol || "http";
  headers["x-forwarded-for"] = buildForwardedFor(
    toSingleHeaderValue(req.headers["x-forwarded-for"]),
    req.ip || req.socket?.remoteAddress || "",
  );
  headers["x-forwarded-by"] = "api-gateway";

  if (req.authUser) {
    if (req.authUser.id != null) {
      headers["x-user-id"] = String(req.authUser.id);
    }
    if (req.authUser.userId != null) {
      headers["x-user-id"] = String(req.authUser.userId);
    }
    if (req.authUser.role) {
      headers["x-user-role"] = String(req.authUser.role);
    }
    if (req.authUser.email) {
      headers["x-user-email"] = String(req.authUser.email);
    }
  }

  return headers;
};

const hasIncomingBody = (req) => {
  const contentLengthValue = toSingleHeaderValue(req.headers["content-length"]);
  if (toPositiveNumber(contentLengthValue)) return true;
  return Boolean(req.headers["transfer-encoding"]);
};

const serializeBody = (body) => {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (body && typeof body === "object") {
    return Buffer.from(JSON.stringify(body));
  }
  return null;
};

const applyResponseHeaders = (res, headers) => {
  for (const [key, value] of Object.entries(headers || {})) {
    const lowerCaseKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerCaseKey)) continue;
    if (typeof value === "undefined") continue;
    res.setHeader(key, value);
  }
};

const proxyRequest = ({ req, res, targetBaseUrl, timeoutMs }) =>
  new Promise((resolve, reject) => {
    let targetUrl;
    try {
      targetUrl = new URL(req.originalUrl || req.url || "/", targetBaseUrl);
    } catch (_error) {
      const err = new Error("Invalid upstream URL");
      err.code = "UPSTREAM_INVALID_URL";
      reject(err);
      return;
    }

    const headers = buildUpstreamHeaders(req);
    const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase()) && hasIncomingBody(req);
    const serializedBody = hasBody ? serializeBody(req.body) : null;

    if (serializedBody) {
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
      headers["content-length"] = Buffer.byteLength(serializedBody);
    }

    const transport = targetUrl.protocol === "https:" ? https : http;
    const upstreamRequest = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: Number(targetUrl.port) || (targetUrl.protocol === "https:" ? 443 : 80),
        method: req.method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers,
        timeout: timeoutMs,
      },
      (upstreamResponse) => {
        applyResponseHeaders(res, upstreamResponse.headers);
        res.status(upstreamResponse.statusCode || 502);
        upstreamResponse.pipe(res);
        upstreamResponse.on("end", () => resolve());
      },
    );

    upstreamRequest.on("timeout", () => {
      const err = new Error("Upstream timeout");
      err.code = "UPSTREAM_TIMEOUT";
      upstreamRequest.destroy(err);
    });

    upstreamRequest.on("error", (error) => {
      reject(error);
    });

    if (serializedBody) {
      upstreamRequest.write(serializedBody);
    }
    upstreamRequest.end();
  });

module.exports = { proxyRequest };
