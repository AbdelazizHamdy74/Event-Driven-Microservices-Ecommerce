const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_SEARCH_SERVICE_URL = "http://localhost:3006";

const toAuthorizationHeader = (authorization) => {
  if (typeof authorization !== "string") return "";
  const value = authorization.trim();
  if (!value) return "";
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
};

const requestSearch = ({
  method,
  path,
  body,
  authorization,
  searchServiceUrl = process.env.SEARCH_SERVICE_URL || DEFAULT_SEARCH_SERVICE_URL,
  timeoutMs = Number(process.env.SEARCH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
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
      url = new URL(path, searchServiceUrl);
    } catch (_error) {
      resolve({
        ok: false,
        status: 502,
        message: "Search service unavailable",
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
            message: parsedBody?.message || "Search service unavailable",
            data: parsedBody,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Search service timeout"));
    });

    request.on("error", () => {
      resolve({
        ok: false,
        status: 502,
        message: "Search service unavailable",
      });
    });

    request.write(payload);
    request.end();
  });

const upsertSearchProductDocument = async ({
  authorization,
  productId,
  categoryId,
  categoryName,
  name,
  description,
  price,
  currency,
  stockQuantity,
  isActive,
  primaryImageUrl,
}) =>
  requestSearch({
    method: "PUT",
    path: `/internal/products/${encodeURIComponent(productId)}`,
    authorization,
    body: {
      categoryId,
      categoryName,
      name,
      description,
      price,
      currency,
      stockQuantity,
      isActive,
      primaryImageUrl,
    },
  });

const deleteSearchProductDocument = async ({ authorization, productId }) =>
  requestSearch({
    method: "DELETE",
    path: `/internal/products/${encodeURIComponent(productId)}`,
    authorization,
    body: {},
  });

module.exports = {
  upsertSearchProductDocument,
  deleteSearchProductDocument,
};
