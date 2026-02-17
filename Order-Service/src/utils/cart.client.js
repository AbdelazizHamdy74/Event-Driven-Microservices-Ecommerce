const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_CART_SERVICE_URL = "http://localhost:3002";

const toAuthorizationHeader = (authorization) => {
  if (typeof authorization !== "string") return "";
  const value = authorization.trim();
  if (!value) return "";
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
};

const fetchMyCart = ({
  authorization,
  cartServiceUrl = process.env.CART_SERVICE_URL || DEFAULT_CART_SERVICE_URL,
  timeoutMs = Number(process.env.CART_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
}) =>
  new Promise((resolve) => {
    const authHeader = toAuthorizationHeader(authorization);
    if (!authHeader) {
      resolve({
        ok: false,
        status: 401,
        message: "Unauthorized",
      });
      return;
    }

    let url;
    try {
      url = new URL("/carts/me", cartServiceUrl);
    } catch (_error) {
      resolve({
        ok: false,
        status: 502,
        message: "Cart service unavailable",
      });
      return;
    }

    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: {
          authorization: authHeader,
        },
        timeout: timeoutMs,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          let payload = null;
          try {
            payload = body ? JSON.parse(body) : null;
          } catch (_error) {
            payload = null;
          }

          const status = response.statusCode || 502;
          if (status >= 200 && status < 300 && payload?.id) {
            resolve({
              ok: true,
              status,
              cart: payload,
            });
            return;
          }

          resolve({
            ok: false,
            status,
            message: payload?.message || "Cart unavailable",
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Cart service timeout"));
    });

    request.on("error", () => {
      resolve({
        ok: false,
        status: 502,
        message: "Cart service unavailable",
      });
    });

    request.end();
  });

module.exports = { fetchMyCart };
