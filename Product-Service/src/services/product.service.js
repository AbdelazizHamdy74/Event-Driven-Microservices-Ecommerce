const db = require("../config/db");
const { getCategoryById } = require("./category.service");
const { createError } = require("../utils/errors");
const { slugify } = require("../utils/slugify");

const isValidImageUrl = (value) =>
  typeof value === "string" &&
  /^https?:\/\/.+/i.test(value.trim()) &&
  value.trim().length <= 1000;

const normalizeImages = (images) => {
  if (!Array.isArray(images) || !images.length) {
    throw createError("Product must include at least one image", 400);
  }

  const normalized = images.map((item, index) => {
    let url = "";
    let isPrimary = false;
    let sortOrder = index;

    if (typeof item === "string") {
      url = item;
    } else if (item && typeof item === "object") {
      url = item.url || item.imageUrl;
      isPrimary = Boolean(item.isPrimary);
      sortOrder = Number.isInteger(item.sortOrder) ? item.sortOrder : index;
    }

    if (!isValidImageUrl(url)) {
      throw createError("Each product image must be a valid http/https URL", 400);
    }

    return {
      imageUrl: url.trim(),
      isPrimary,
      sortOrder,
    };
  });

  let primaryAssigned = false;
  const singlePrimary = normalized.map((item) => {
    if (item.isPrimary && !primaryAssigned) {
      primaryAssigned = true;
      return item;
    }

    return {
      ...item,
      isPrimary: false,
    };
  });

  if (!primaryAssigned) {
    singlePrimary[0].isPrimary = true;
  }

  return singlePrimary;
};

const normalizeCurrency = (currency) => {
  if (typeof currency !== "string" || !currency.trim()) return "USD";
  const normalized = currency.trim().toUpperCase();
  return normalized.slice(0, 3);
};

const getProductImages = async (productId) => {
  const [imageRows] = await db.execute(
    [
      "SELECT",
      "id,",
      "image_url AS imageUrl,",
      "is_primary AS isPrimary,",
      "sort_order AS sortOrder,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM product_images",
      "WHERE product_id = ?",
      "ORDER BY is_primary DESC, sort_order ASC, id ASC",
    ].join(" "),
    [productId],
  );

  return imageRows;
};

const createProduct = async (payload, user) => {
  const categoryId = Number(payload.categoryId);
  const price = Number(payload.price);
  const stockQuantity = Number.isInteger(payload.stockQuantity)
    ? payload.stockQuantity
    : Number(payload.stockQuantity ?? 0);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw createError("Valid categoryId is required", 400);
  }

  if (typeof payload.name !== "string" || !payload.name.trim()) {
    throw createError("Product name is required", 400);
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw createError("Product price must be greater than 0", 400);
  }

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    throw createError("stockQuantity must be a non-negative integer", 400);
  }

  if (!user || (user.role !== "admin" && user.role !== "supplier")) {
    throw createError("Only admin or supplier can create product", 403);
  }

  const category = await getCategoryById(categoryId);
  if (!category || !category.isActive) {
    throw createError("Category not found or inactive", 404);
  }

  const normalizedName = payload.name.trim();
  const slug = slugify(normalizedName, 220);
  if (!slug) {
    throw createError("Invalid product name", 400);
  }

  const images = normalizeImages(payload.images);
  const currency = normalizeCurrency(payload.currency);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let productResult;
    try {
      [productResult] = await connection.execute(
        [
          "INSERT INTO products (",
          "category_id,",
          "name,",
          "slug,",
          "description,",
          "price,",
          "currency,",
          "stock_quantity,",
          "created_by_user_id,",
          "created_by_role",
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
        [
          categoryId,
          normalizedName,
          slug,
          typeof payload.description === "string"
            ? payload.description.trim()
            : null,
          Number(price.toFixed(2)),
          currency,
          stockQuantity,
          Number(user.id),
          user.role,
        ],
      );
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw createError("Product already exists", 409);
      }

      throw err;
    }

    for (const image of images) {
      await connection.execute(
        [
          "INSERT INTO product_images (product_id, image_url, is_primary, sort_order)",
          "VALUES (?, ?, ?, ?)",
        ].join(" "),
        [
          productResult.insertId,
          image.imageUrl,
          image.isPrimary ? 1 : 0,
          image.sortOrder,
        ],
      );
    }

    await connection.commit();
    return getProductById(productResult.insertId, { onlyActive: false });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const buildProductRecord = (row, images) => ({
  id: row.id,
  categoryId: row.categoryId,
  categoryName: row.categoryName,
  name: row.name,
  slug: row.slug,
  description: row.description,
  price: row.price,
  currency: row.currency,
  stockQuantity: row.stockQuantity,
  isActive: row.isActive,
  createdByUserId: row.createdByUserId,
  createdByRole: row.createdByRole,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  images,
});

const getProductById = async (productId, { onlyActive = true } = {}) => {
  const params = [productId];
  let whereClause = "WHERE p.id = ?";

  if (onlyActive) {
    whereClause += " AND p.is_active = TRUE AND c.is_active = TRUE";
  }

  const [rows] = await db.execute(
    [
      "SELECT",
      "p.id,",
      "p.category_id AS categoryId,",
      "c.name AS categoryName,",
      "p.name,",
      "p.slug,",
      "p.description,",
      "p.price,",
      "p.currency,",
      "p.stock_quantity AS stockQuantity,",
      "p.is_active AS isActive,",
      "p.created_by_user_id AS createdByUserId,",
      "p.created_by_role AS createdByRole,",
      "p.created_at AS createdAt,",
      "p.updated_at AS updatedAt",
      "FROM products p",
      "JOIN categories c ON c.id = p.category_id",
      whereClause,
      "LIMIT 1",
    ].join(" "),
    params,
  );

  if (!rows.length) return null;
  const row = rows[0];
  const images = await getProductImages(row.id);

  return buildProductRecord(row, images);
};

const listProducts = async ({ categoryId, onlyActive = true } = {}) => {
  const whereParts = [];
  const params = [];

  if (Number.isInteger(categoryId) && categoryId > 0) {
    whereParts.push("p.category_id = ?");
    params.push(categoryId);
  }

  if (onlyActive) {
    whereParts.push("p.is_active = TRUE");
    whereParts.push("c.is_active = TRUE");
  }

  const whereClause = whereParts.length
    ? `WHERE ${whereParts.join(" AND ")}`
    : "";

  const [rows] = await db.execute(
    [
      "SELECT",
      "p.id,",
      "p.category_id AS categoryId,",
      "c.name AS categoryName,",
      "p.name,",
      "p.slug,",
      "p.description,",
      "p.price,",
      "p.currency,",
      "p.stock_quantity AS stockQuantity,",
      "p.is_active AS isActive,",
      "p.created_by_user_id AS createdByUserId,",
      "p.created_by_role AS createdByRole,",
      "p.created_at AS createdAt,",
      "p.updated_at AS updatedAt",
      "FROM products p",
      "JOIN categories c ON c.id = p.category_id",
      whereClause,
      "ORDER BY p.created_at DESC",
    ]
      .join(" ")
      .trim(),
    params,
  );

  if (!rows.length) return [];

  const productIds = rows.map((row) => row.id);
  const placeholders = productIds.map(() => "?").join(", ");
  const [imageRows] = await db.execute(
    [
      "SELECT",
      "id,",
      "product_id AS productId,",
      "image_url AS imageUrl,",
      "is_primary AS isPrimary,",
      "sort_order AS sortOrder,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM product_images",
      `WHERE product_id IN (${placeholders})`,
      "ORDER BY is_primary DESC, sort_order ASC, id ASC",
    ].join(" "),
    productIds,
  );

  const imagesByProduct = new Map();
  for (const image of imageRows) {
    const list = imagesByProduct.get(image.productId) || [];
    list.push({
      id: image.id,
      imageUrl: image.imageUrl,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    });
    imagesByProduct.set(image.productId, list);
  }

  return rows.map((row) =>
    buildProductRecord(row, imagesByProduct.get(row.id) || []),
  );
};

const getProductForCart = async (productId) => {
  const product = await getProductById(productId, { onlyActive: true });
  if (!product) return null;
  if (!Number.isFinite(Number(product.stockQuantity))) return null;
  if (Number(product.stockQuantity) <= 0) return null;
  if (!Array.isArray(product.images) || !product.images.length) return null;

  const primaryImage =
    product.images.find((image) => image.isPrimary) || product.images[0];

  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    currency: product.currency,
    stockQuantity: Number(product.stockQuantity),
    imageUrl: primaryImage?.imageUrl || null,
  };
};

module.exports = {
  createProduct,
  getProductById,
  getProductForCart,
  listProducts,
};
