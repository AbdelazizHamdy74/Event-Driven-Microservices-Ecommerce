const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_INVENTORY_SERVICE_URL = "http://localhost:3005";

const requestInventory = ({
  method,
  path,
  body,
  inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL ||
    DEFAULT_INVENTORY_SERVICE_URL,
  timeoutMs = Number(process.env.INVENTORY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
}) =>
  new Promise((resolve) => {
    let url;
    try {
      url = new URL(path, inventoryServiceUrl);
    } catch (_error) {
      resolve({
        ok: false,
        status: 502,
        message: "Inventory service unavailable",
      });
      return;
    }

    const payload = body === undefined ? "" : JSON.stringify(body);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
        method,
        path: `${url.pathname}${url.search}`,
        timeout: timeoutMs,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let bodyText = "";
        response.on("data", (chunk) => {
          bodyText += chunk;
        });

        response.on("end", () => {
          let parsedBody = null;
          try {
            parsedBody = bodyText ? JSON.parse(bodyText) : null;
          } catch (_error) {
            parsedBody = null;
          }

          const status = response.statusCode || 502;
          if (status >= 200 && status < 300) {
            resolve({
              ok: true,
              status,
              data: parsedBody,
            });
            return;
          }

          resolve({
            ok: false,
            status,
            message: parsedBody?.message || "Inventory service unavailable",
            data: parsedBody,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Inventory service timeout"));
    });

    request.on("error", () => {
      resolve({
        ok: false,
        status: 502,
        message: "Inventory service unavailable",
      });
    });

    request.write(payload);
    request.end();
  });

const reserveStockForOrder = async ({
  orderId,
  productId,
  quantity,
  reservationTtlSeconds = Number(
    process.env.INVENTORY_RESERVATION_TTL_SECONDS,
  ) || 900,
}) => {
  const normalizedTtl = Number(reservationTtlSeconds);
  const expiresAt =
    Number.isFinite(normalizedTtl) && normalizedTtl > 0
      ? new Date(Date.now() + normalizedTtl * 1000).toISOString()
      : null;

  return requestInventory({
    method: "POST",
    path: "/internal/reservations",
    body: {
      orderId,
      productId,
      quantity,
      expiresAt,
    },
  });
};

const releaseStockByOrderId = async ({ orderId, reason }) =>
  requestInventory({
    method: "POST",
    path: `/internal/orders/${encodeURIComponent(orderId)}/release`,
    body: reason
      ? {
          reason,
        }
      : {},
  });

const confirmStockByOrderId = async ({ orderId }) =>
  requestInventory({
    method: "POST",
    path: `/internal/orders/${encodeURIComponent(orderId)}/confirm`,
    body: {},
  });

module.exports = {
  reserveStockForOrder,
  releaseStockByOrderId,
  confirmStockByOrderId,
};
