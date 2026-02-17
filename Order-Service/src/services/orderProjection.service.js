const db = require("../config/db");
const {
  normalizeAccountStatus,
  normalizeRole,
} = require("../utils/userRole");

const upsertOrderUserProjection = async ({
  userId,
  name,
  email,
  role,
  accountStatus,
}) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id in event");
  }

  const normalizedName =
    typeof name === "string" && name.trim() ? name.trim() : null;
  const normalizedEmail =
    typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;

  await db.execute(
    [
      "INSERT INTO order_users (user_id, name, email, role, account_status)",
      "VALUES (?, ?, ?, ?, ?)",
      "ON DUPLICATE KEY UPDATE",
      "name = COALESCE(VALUES(name), name),",
      "email = COALESCE(VALUES(email), email),",
      "role = VALUES(role),",
      "account_status = VALUES(account_status),",
      "updated_at = CURRENT_TIMESTAMP",
    ].join(" "),
    [
      userId,
      normalizedName,
      normalizedEmail,
      normalizeRole(role),
      normalizeAccountStatus(accountStatus),
    ],
  );
};

module.exports = { upsertOrderUserProjection };
