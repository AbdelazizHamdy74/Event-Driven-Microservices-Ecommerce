const http = require("http");
const https = require("https");

const fetchProductForCart = ({
  productId,
  productServiceUrl = process.env.PRODUCT_SERVICE_URL || "http://localhost:3004",
  timeoutMs = Number(process.env.PRODUCT_SERVICE_TIMEOUT_MS) || 3000,
}) =>
  new Promise((resolve) => {
    let url;
    try {
      url = new URL(`/internal/products/${productId}`, productServiceUrl);
    } catch (_err) {
      resolve({
        ok: false,
        status: 502,
        message: "Product service unavailable",
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
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          let parsedBody = null;
          try {
            parsedBody = body ? JSON.parse(body) : null;
          } catch (_err) {
            parsedBody = null;
          }

          const status = response.statusCode || 502;
          if (status >= 200 && status < 300 && parsedBody?.id) {
            resolve({
              ok: true,
              status,
              product: parsedBody,
            });
            return;
          }

          resolve({
            ok: false,
            status,
            message: parsedBody?.message || "Product unavailable",
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Product service timeout"));
    });

    request.on("error", () => {
      resolve({
        ok: false,
        status: 502,
        message: "Product service unavailable",
      });
    });

    request.end();
  });

module.exports = { fetchProductForCart };
