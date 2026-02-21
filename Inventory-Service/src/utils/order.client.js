const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_ORDER_SERVICE_URL = "http://localhost:3003";

const fetchOrderExists = ({
  orderId,
  orderServiceUrl = process.env.ORDER_SERVICE_URL || DEFAULT_ORDER_SERVICE_URL,
  timeoutMs = Number(process.env.ORDER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
}) =>
  new Promise((resolve) => {
    let url;
    try {
      url = new URL(
        `/internal/orders/${encodeURIComponent(orderId)}/exists`,
        orderServiceUrl,
      );
    } catch (_error) {
      resolve({
        ok: false,
        status: 502,
        message: "Order service unavailable",
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
        timeout: timeoutMs,
      },
      (response) => {
        let bodyText = "";
        response.on("data", (chunk) => {
          bodyText += chunk;
        });

        response.on("end", () => {
          let payload = null;
          try {
            payload = bodyText ? JSON.parse(bodyText) : null;
          } catch (_error) {
            payload = null;
          }

          const status = response.statusCode || 502;
          if (status >= 200 && status < 300 && payload?.exists === true) {
            resolve({
              ok: true,
              status,
              data: payload,
            });
            return;
          }

          resolve({
            ok: false,
            status,
            message: payload?.message || "Order service unavailable",
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Order service timeout"));
    });

    request.on("error", () => {
      resolve({
        ok: false,
        status: 502,
        message: "Order service unavailable",
      });
    });

    request.end();
  });

module.exports = {
  fetchOrderExists,
};
