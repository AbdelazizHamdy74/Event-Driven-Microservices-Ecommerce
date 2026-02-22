const db = require("../config/db");
const { createError } = require("../utils/errors");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const toPositiveInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }

  return normalized;
};

const toOptionalPositiveInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  return toPositiveInt(value, fieldName);
};

const toNonNegativeInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw createError(`${fieldName} must be a non-negative integer`, 400);
  }

  return normalized;
};

const toNonNegativeNumber = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw createError(`${fieldName} must be a non-negative number`, 400);
  }

  return normalized;
};

const toOptionalNonNegativeNumber = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  return toNonNegativeNumber(value, fieldName);
};

const parseOptionalBoolean = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1)) {
    return Boolean(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }

  throw createError(`Invalid ${fieldName}`, 400);
};

const normalizeCurrency = (value) => {
  if (typeof value !== "string" || !value.trim()) return "USD";
  return value.trim().toUpperCase().slice(0, 3);
};

const normalizeOptionalText = (value, maxLength) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw createError("Invalid text field", 400);
  }

  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const normalizePage = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return 1;
  return normalized;
};

const normalizePageSize = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(normalized, MAX_PAGE_SIZE);
};

const mapDocumentRow = (row) => ({
  productId: Number(row.productId),
  categoryId:
    row.categoryId === null || row.categoryId === undefined
      ? null
      : Number(row.categoryId),
  categoryName: row.categoryName,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  currency: row.currency,
  stockQuantity: Number(row.stockQuantity),
  isActive: Boolean(row.isActive),
  primaryImageUrl: row.primaryImageUrl,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const getProductDocumentById = async (productId) => {
  const normalizedProductId = toPositiveInt(productId, "productId");
  const [rows] = await db.execute(
    [
      "SELECT",
      "product_id AS productId,",
      "category_id AS categoryId,",
      "category_name AS categoryName,",
      "name,",
      "description,",
      "price,",
      "currency,",
      "stock_quantity AS stockQuantity,",
      "is_active AS isActive,",
      "primary_image_url AS primaryImageUrl,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM search_products",
      "WHERE product_id = ?",
      "LIMIT 1",
    ].join(" "),
    [normalizedProductId],
  );

  if (!rows.length) return null;
  return mapDocumentRow(rows[0]);
};

const upsertProductDocument = async (payload) => {
  const productId = toPositiveInt(payload.productId, "productId");
  if (typeof payload.name !== "string" || !payload.name.trim()) {
    throw createError("Product name is required", 400);
  }

  const categoryId = toOptionalPositiveInt(payload.categoryId, "categoryId");
  const price = toNonNegativeNumber(payload.price, "price");
  const stockQuantity = toNonNegativeInt(
    payload.stockQuantity ?? 0,
    "stockQuantity",
  );
  const isActive =
    parseOptionalBoolean(payload.isActive, "isActive") ?? true;

  const name = payload.name.trim().slice(0, 180);
  const categoryName = normalizeOptionalText(payload.categoryName, 120);
  const description = normalizeOptionalText(payload.description, 5000);
  const primaryImageUrl = normalizeOptionalText(
    payload.primaryImageUrl ?? payload.imageUrl,
    1000,
  );
  const currency = normalizeCurrency(payload.currency);

  await db.execute(
    [
      "INSERT INTO search_products (",
      "product_id,",
      "category_id,",
      "category_name,",
      "name,",
      "description,",
      "price,",
      "currency,",
      "stock_quantity,",
      "is_active,",
      "primary_image_url",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON DUPLICATE KEY UPDATE",
      "category_id = VALUES(category_id),",
      "category_name = VALUES(category_name),",
      "name = VALUES(name),",
      "description = VALUES(description),",
      "price = VALUES(price),",
      "currency = VALUES(currency),",
      "stock_quantity = VALUES(stock_quantity),",
      "is_active = VALUES(is_active),",
      "primary_image_url = VALUES(primary_image_url),",
      "updated_at = CURRENT_TIMESTAMP",
    ].join(" "),
    [
      productId,
      categoryId,
      categoryName,
      name,
      description,
      Number(price.toFixed(2)),
      currency,
      stockQuantity,
      isActive ? 1 : 0,
      primaryImageUrl,
    ],
  );

  return getProductDocumentById(productId);
};

const deleteProductDocument = async (productId) => {
  const normalizedProductId = toPositiveInt(productId, "productId");
  const [result] = await db.execute(
    "DELETE FROM search_products WHERE product_id = ?",
    [normalizedProductId],
  );

  return Number(result.affectedRows) > 0;
};

const searchProducts = async ({
  query,
  categoryId,
  minPrice,
  maxPrice,
  inStock,
  page,
  pageSize,
}) => {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  const normalizedCategoryId = toOptionalPositiveInt(categoryId, "categoryId");
  const normalizedMinPrice = toOptionalNonNegativeNumber(minPrice, "minPrice");
  const normalizedMaxPrice = toOptionalNonNegativeNumber(maxPrice, "maxPrice");
  const normalizedInStock = parseOptionalBoolean(inStock, "inStock");
  const normalizedPage = normalizePage(page);
  const normalizedPageSize = normalizePageSize(pageSize);

  if (
    normalizedMinPrice !== null &&
    normalizedMaxPrice !== null &&
    normalizedMinPrice > normalizedMaxPrice
  ) {
    throw createError("minPrice cannot be greater than maxPrice", 400);
  }

  const whereParts = ["is_active = TRUE"];
  const whereParams = [];

  if (normalizedCategoryId !== null) {
    whereParts.push("category_id = ?");
    whereParams.push(normalizedCategoryId);
  }

  if (normalizedMinPrice !== null) {
    whereParts.push("price >= ?");
    whereParams.push(normalizedMinPrice);
  }

  if (normalizedMaxPrice !== null) {
    whereParts.push("price <= ?");
    whereParams.push(normalizedMaxPrice);
  }

  if (normalizedInStock === true) {
    whereParts.push("stock_quantity > 0");
  }

  if (normalizedInStock === false) {
    whereParts.push("stock_quantity = 0");
  }

  if (normalizedQuery) {
    whereParts.push("(name LIKE ? OR description LIKE ? OR category_name LIKE ?)");
    const searchPattern = `%${normalizedQuery}%`;
    whereParams.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = whereParts.length
    ? `WHERE ${whereParts.join(" AND ")}`
    : "";

  const [countRows] = await db.execute(
    ["SELECT COUNT(*) AS total", "FROM search_products", whereClause].join(" "),
    whereParams,
  );

  const total = Number(countRows[0].total || 0);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const rowParams = [...whereParams];
  let orderClause = "ORDER BY updated_at DESC, product_id DESC";

  if (normalizedQuery) {
    orderClause = [
      "ORDER BY",
      "CASE",
      "WHEN name LIKE ? THEN 0",
      "WHEN category_name LIKE ? THEN 1",
      "ELSE 2",
      "END,",
      "updated_at DESC,",
      "product_id DESC",
    ].join(" ");
    const prefixPattern = `${normalizedQuery}%`;
    rowParams.push(prefixPattern, prefixPattern);
  }

  rowParams.push(normalizedPageSize, offset);
  const [rows] = await db.execute(
    [
      "SELECT",
      "product_id AS productId,",
      "category_id AS categoryId,",
      "category_name AS categoryName,",
      "name,",
      "description,",
      "price,",
      "currency,",
      "stock_quantity AS stockQuantity,",
      "is_active AS isActive,",
      "primary_image_url AS primaryImageUrl,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM search_products",
      whereClause,
      orderClause,
      "LIMIT ? OFFSET ?",
    ].join(" "),
    rowParams,
  );

  return {
    query: normalizedQuery || null,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / normalizedPageSize),
    items: rows.map(mapDocumentRow),
  };
};

module.exports = {
  searchProducts,
  upsertProductDocument,
  deleteProductDocument,
};
