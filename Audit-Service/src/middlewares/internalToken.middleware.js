const readHeaderValue = (value) => {
  if (Array.isArray(value)) return value[0];
  if (typeof value === "string") return value;
  return null;
};

const requireInternalToken = (req, res, next) => {
  const expectedToken = process.env.AUDIT_INTERNAL_TOKEN;
  if (!expectedToken) {
    next();
    return;
  }

  const token = readHeaderValue(req.headers["x-audit-token"]);
  if (!token || token !== expectedToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  next();
};

module.exports = { requireInternalToken };
