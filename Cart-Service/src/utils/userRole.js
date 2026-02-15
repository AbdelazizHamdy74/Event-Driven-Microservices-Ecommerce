const normalizeRole = (role) => {
  if (role === "admin") return "admin";
  if (role === "supplier") return "supplier";
  return "user";
};

const normalizeAccountStatus = (status) =>
  status === "blocked" ? "blocked" : "active";

module.exports = {
  normalizeAccountStatus,
  normalizeRole,
};
