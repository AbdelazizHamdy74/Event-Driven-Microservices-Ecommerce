const db = require("../config/db");
const {
  normalizeAccountStatus,
  normalizeRole,
} = require("../utils/userRole");

const upsertUserProjectionAndCart = async ({
  userId,
  name,
  email,
  role,
  accountStatus,
}) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id in event");
  }

  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Invalid user email in event");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      [
        "INSERT INTO cart_users (user_id, name, email, role, account_status)",
        "VALUES (?, ?, ?, ?, ?)",
        "ON DUPLICATE KEY UPDATE",
        "name = VALUES(name),",
        "email = VALUES(email),",
        "role = VALUES(role),",
        "account_status = VALUES(account_status),",
        "updated_at = CURRENT_TIMESTAMP",
      ].join(" "),
      [
        userId,
        typeof name === "string" && name.trim() ? name.trim() : "User",
        email.trim().toLowerCase(),
        normalizeRole(role),
        normalizeAccountStatus(accountStatus),
      ],
    );

    await connection.execute(
      [
        "INSERT INTO carts (user_id) VALUES (?)",
        "ON DUPLICATE KEY UPDATE",
        "updated_at = CURRENT_TIMESTAMP",
      ].join(" "),
      [userId],
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { upsertUserProjectionAndCart };
