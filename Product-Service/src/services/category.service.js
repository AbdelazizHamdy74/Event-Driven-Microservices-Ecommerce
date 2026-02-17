const db = require("../config/db");
const { createError } = require("../utils/errors");
const { slugify } = require("../utils/slugify");

const createCategory = async ({ name, description }, createdByUserId) => {
  if (typeof name !== "string" || !name.trim()) {
    throw createError("Category name is required", 400);
  }

  const normalizedName = name.trim();
  const slug = slugify(normalizedName, 140);
  if (!slug) {
    throw createError("Invalid category name", 400);
  }

  let result;
  try {
    [result] = await db.execute(
      [
        "INSERT INTO categories (name, slug, description, created_by_user_id)",
        "VALUES (?, ?, ?, ?)",
      ].join(" "),
      [
        normalizedName,
        slug,
        typeof description === "string" ? description.trim() : null,
        createdByUserId,
      ],
    );
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      throw createError("Category already exists", 409);
    }

    throw err;
  }

  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "name,",
      "slug,",
      "description,",
      "is_active AS isActive,",
      "created_by_user_id AS createdByUserId,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM categories",
      "WHERE id = ?",
      "LIMIT 1",
    ].join(" "),
    [result.insertId],
  );

  return rows[0] || null;
};

const listCategories = async ({ onlyActive = true } = {}) => {
  const whereClause = onlyActive ? "WHERE is_active = TRUE" : "";
  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "name,",
      "slug,",
      "description,",
      "is_active AS isActive,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM categories",
      whereClause,
      "ORDER BY name ASC",
    ]
      .join(" ")
      .trim(),
  );

  return rows;
};

const getCategoryById = async (categoryId) => {
  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "name,",
      "slug,",
      "description,",
      "is_active AS isActive,",
      "created_by_user_id AS createdByUserId,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM categories",
      "WHERE id = ?",
      "LIMIT 1",
    ].join(" "),
    [categoryId],
  );

  return rows[0] || null;
};

module.exports = {
  createCategory,
  getCategoryById,
  listCategories,
};
