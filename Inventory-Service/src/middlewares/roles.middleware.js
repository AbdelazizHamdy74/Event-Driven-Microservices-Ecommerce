const allowRoles = (...roles) => {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!req.user || !allowed.has(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
};

module.exports = { allowRoles };
