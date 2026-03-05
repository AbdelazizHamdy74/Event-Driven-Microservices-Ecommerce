const { isInternalPath, normalizePathname, resolveRouteTarget } = require("../config/routes");
const { proxyRequest } = require("../utils/proxyRequest");

const createProxyMiddleware = ({
  serviceUrls,
  proxyTimeoutMs,
  exposeInternalRoutes = false,
}) => {
  const middleware = async (req, res, next) => {
    const pathname = normalizePathname(req.path || req.originalUrl || "/");

    if (!exposeInternalRoutes && isInternalPath(pathname)) {
      res.status(403).json({
        message: "Internal routes are not exposed through the API Gateway.",
      });
      return;
    }

    const target = resolveRouteTarget(pathname, serviceUrls);
    if (!target) {
      next();
      return;
    }

    try {
      await proxyRequest({
        req,
        res,
        targetBaseUrl: target.baseUrl,
        timeoutMs: proxyTimeoutMs,
      });
    } catch (error) {
      const isTimeout = error.code === "UPSTREAM_TIMEOUT" || error.code === "ETIMEDOUT";
      const err = new Error(
        isTimeout ? "Upstream service timeout." : "Upstream service unavailable.",
      );
      err.statusCode = isTimeout ? 504 : 502;
      next(err);
    }
  };

  return middleware;
};

module.exports = {
  createProxyMiddleware,
};
