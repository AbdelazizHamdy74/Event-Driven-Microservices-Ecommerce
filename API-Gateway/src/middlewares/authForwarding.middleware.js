const { validateUserSession } = require("../../../shared/auth/validateUserSession");
const { resolveAuthPolicy } = require("../config/routes");

const normalizeRole = (role) => {
  if (typeof role !== "string") return "user";
  const normalized = role.trim().toLowerCase();
  return normalized || "user";
};

const hasAuthorizationHeader = (authorization) =>
  typeof authorization === "string" && authorization.trim().length > 0;

const createAuthForwardingMiddleware = ({ userServiceUrl, authTimeoutMs }) => {
  const middleware = async (req, res, next) => {
    const policy = resolveAuthPolicy({
      method: req.method,
      pathname: req.path || req.originalUrl || "/",
    });

    const authorization = req.headers.authorization;
    const hasAuthHeader = hasAuthorizationHeader(authorization);
    if (!policy.requiresAuth && !hasAuthHeader) {
      next();
      return;
    }

    const session = await validateUserSession({
      authorization,
      userServiceUrl,
      timeoutMs: authTimeoutMs,
    });

    if (!session.ok || !session.user) {
      if (policy.requiresAuth) {
        res.status(session.status || 401).json({
          message: session.message || "Unauthorized",
        });
        return;
      }

      next();
      return;
    }

    const userRole = normalizeRole(session.user.role);
    if (policy.roles.length > 0 && !policy.roles.includes(userRole)) {
      res.status(403).json({
        message: "Forbidden",
      });
      return;
    }

    req.authUser = {
      ...session.user,
      role: userRole,
    };

    next();
  };

  return middleware;
};

module.exports = {
  createAuthForwardingMiddleware,
};
