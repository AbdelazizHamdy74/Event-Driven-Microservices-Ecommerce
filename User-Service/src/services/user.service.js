const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { publishUserCreated } = require("../events/userEvents");

const createError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const ALLOWED_ROLES = new Set(["user", "admin", "supplier"]);

exports.createUser = async (userData) => {
  const { name, email, password, role } = userData;

  if (typeof name !== "string" || !name.trim()) {
    throw createError("Name is required", 400);
  }

  if (typeof email !== "string" || !email.trim()) {
    throw createError("Email is required", 400);
  }

  if (typeof password !== "string" || password.length < 8) {
    throw createError("Password must be at least 8 characters", 400);
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const requestedRole =
    typeof role === "string" ? role.trim().toLowerCase() : "";
  const normalizedRole = ALLOWED_ROLES.has(requestedRole)
    ? requestedRole
    : "user";

  const hashedPassword = await bcrypt.hash(password, 10);

  let result;
  try {
    [result] = await db.execute(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [normalizedName, normalizedEmail, hashedPassword, normalizedRole],
    );
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      throw createError("Email already exists", 409);
    }

    throw err;
  }

  const [rows] = await db.execute(
    "SELECT id, name, email, role, account_status FROM users WHERE id = ? LIMIT 1",
    [result.insertId],
  );
  const createdUser = rows[0];
  if (!createdUser) {
    throw createError("Failed to fetch created user", 500);
  }

  const user = {
    id: createdUser.id,
    name: createdUser.name,
    email: createdUser.email,
    role: createdUser.role,
    accountStatus: createdUser.account_status,
  };

  await publishUserCreated(user);

  return user;
};

exports.getUserById = async (id) => {
  const [rows] = await db.execute(
    "SELECT id, name, email, role, account_status AS accountStatus FROM users WHERE id = ?",
    [id],
  );
  if (!rows.length) return null;
  return rows[0];
};

exports.updateUser = async (id, payload = {}) => {
  const fields = [];
  const values = [];

  if (typeof payload.name === "string" && payload.name.trim()) {
    fields.push("name = ?");
    values.push(payload.name.trim());
  }

  if (typeof payload.email === "string" && payload.email.trim()) {
    fields.push("email = ?");
    values.push(payload.email.trim().toLowerCase());
  }

  const requestedRole =
    typeof payload.role === "string"
      ? payload.role.trim().toLowerCase()
      : "";
  if (ALLOWED_ROLES.has(requestedRole)) {
    fields.push("role = ?");
    values.push(requestedRole);
  }

  if (typeof payload.password === "string" && payload.password) {
    const hashedPassword = await bcrypt.hash(payload.password, 10);
    fields.push("password = ?");
    values.push(hashedPassword);
  }

  if (!fields.length) {
    throw new Error("No valid fields to update");
  }

  values.push(id);
  let result;
  try {
    [result] = await db.execute(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      throw createError("Email already exists", 409);
    }

    throw err;
  }

  if (!result.affectedRows) return null;

  const [rows] = await db.execute(
    "SELECT id, name, email, role, account_status AS accountStatus FROM users WHERE id = ?",
    [id],
  );
  return rows[0] || null;
};

exports.deleteUser = async (id) => {
  const [result] = await db.execute("DELETE FROM users WHERE id = ?", [id]);
  if (!result.affectedRows) return false;
  return true;
};
