const { validateUserSession } = require("../../../shared/auth/validateUserSession");

const requireAuth = async (req, res, next) => {
  const session = await validateUserSession({
    authorization: req.headers.authorization,
    userServiceUrl: process.env.USER_SERVICE_URL || "http://localhost:3001",
    timeoutMs: Number(process.env.AUTH_TIMEOUT_MS) || 3000,
  });

  if (!session.ok || !session.user) {
    return res.status(session.status || 401).json({
      message: session.message || "Unauthorized",
    });
  }

  req.user = session.user;
  next();
};

module.exports = { requireAuth };
