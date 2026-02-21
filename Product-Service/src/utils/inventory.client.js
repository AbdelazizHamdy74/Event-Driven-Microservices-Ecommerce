const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_INVENTORY_SERVICE_URL = "http://localhost:3005";

const toAuthorizationHeader = (authorization) => {
  if (typeof authorization !== "string") return "";
  const value = authorization.trim();
  if (!value) return "";
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
};

const requestInventory = ({
  method,
  path,
  body,
  authorization,
  inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL ||
    DEFAULT_INVENTORY_SERVICE_URL,
  timeoutMs = Number(process.env.INVENTORY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
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
          authorization: authHeader,
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

const upsertInventoryStockByProductId = async ({
  authorization,
  productId,
  totalQuantity,
}) =>
  requestInventory({
    method: "PUT",
    path: `/inventory/${encodeURIComponent(productId)}/stock`,
    authorization,
    body: {
      totalQuantity,
    },
  });

module.exports = {
  upsertInventoryStockByProductId,
};
