const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_ORDER_SERVICE_URL = "http://localhost:3003";

const requestOrder = ({
  method,
  path,
  body,
  orderServiceUrl = process.env.ORDER_SERVICE_URL || DEFAULT_ORDER_SERVICE_URL,
  timeoutMs = Number(process.env.ORDER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
}) =>
  new Promise((resolve) => {
    let url;
    try {
      url = new URL(path, orderServiceUrl);
    } catch (_error) {
      resolve({
        ok: false,
        status: 502,
        message: "Order service unavailable",
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
            message: parsedBody?.message || "Order service unavailable",
            data: parsedBody,
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

    request.write(payload);
    request.end();
  });

const fetchOrderExists = async ({ orderId }) => {
  const result = await requestOrder({
    method: "GET",
    path: `/internal/orders/${encodeURIComponent(orderId)}/exists`,
  });

  if (!result.ok || !result.data?.exists || !result.data?.order) {
    return {
      ok: false,
      status: result.status,
      message: result.message || "Order not found",
    };
  }

  return {
    ok: true,
    status: result.status,
    order: result.data.order,
  };
};

const markOrderPaid = async ({
  orderId,
  paymentId,
  provider,
  providerPaymentId,
}) => {
  const result = await requestOrder({
    method: "POST",
    path: `/internal/orders/${encodeURIComponent(orderId)}/mark-paid`,
    body: {
      paymentId,
      provider,
      providerPaymentId,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: result.message || "Failed to mark order paid",
    };
  }

  return {
    ok: true,
    status: result.status,
    data: result.data || null,
  };
};

module.exports = {
  fetchOrderExists,
  markOrderPaid,
};
