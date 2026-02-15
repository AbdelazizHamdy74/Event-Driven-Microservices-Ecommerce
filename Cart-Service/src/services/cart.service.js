const db = require("../config/db");

const createError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const getCartByUserId = async (userId) => {
  const [cartRows] = await db.execute(
    [
      "SELECT",
      "c.id,",
      "c.user_id AS userId,",
      "c.status,",
      "c.currency,",
      "c.created_at AS createdAt,",
      "c.updated_at AS updatedAt",
      "FROM carts c",
      "WHERE c.user_id = ?",
      "LIMIT 1",
    ].join(" "),
    [userId],
  );

  if (!cartRows.length) return null;
  const cart = cartRows[0];

  const [itemRows] = await db.execute(
    [
      "SELECT",
      "id,",
      "product_id AS productId,",
      "product_name AS productName,",
      "product_image_url AS productImageUrl,",
      "quantity,",
      "unit_price AS unitPrice,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM cart_items",
      "WHERE cart_id = ?",
      "ORDER BY id ASC",
    ].join(" "),
    [cart.id],
  );

  const totalAmount = itemRows.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );

  return {
    ...cart,
    itemsCount: itemRows.length,
    totalAmount: Number(totalAmount.toFixed(2)),
    items: itemRows,
  };
};

const addProductToCart = async ({
  userId,
  productId,
  productName,
  unitPrice,
  productImageUrl,
  quantity,
}) => {
  const normalizedProductId = Number(productId);
  const normalizedQuantity = Number(quantity);
  const normalizedProductName =
    typeof productName === "string" ? productName.trim() : "";
  const normalizedUnitPrice = Number(unitPrice);
  const normalizedProductImageUrl =
    typeof productImageUrl === "string" && productImageUrl.trim()
      ? productImageUrl.trim()
      : null;

  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    throw createError("Invalid productId", 400);
  }

  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    throw createError("Quantity must be a positive integer", 400);
  }

  if (!normalizedProductName) {
    throw createError("productName is required", 400);
  }

  if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice <= 0) {
    throw createError("unitPrice must be greater than 0", 400);
  }

  if (
    normalizedProductImageUrl &&
    !/^https?:\/\/.+/i.test(normalizedProductImageUrl)
  ) {
    throw createError("productImageUrl must be a valid URL", 400);
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [cartRows] = await connection.execute(
      "SELECT id FROM carts WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [userId],
    );

    if (!cartRows.length) {
      throw createError("Cart not found for this user", 404);
    }

    const cartId = cartRows[0].id;

    const [itemRows] = await connection.execute(
      [
        "SELECT id, quantity",
        "FROM cart_items",
        "WHERE cart_id = ? AND product_id = ?",
        "LIMIT 1 FOR UPDATE",
      ].join(" "),
      [cartId, normalizedProductId],
    );

    const currentQuantity = itemRows.length ? Number(itemRows[0].quantity) : 0;
    const targetQuantity = currentQuantity + normalizedQuantity;

    if (itemRows.length) {
      await connection.execute(
        [
          "UPDATE cart_items",
          "SET quantity = ?, unit_price = ?, product_name = ?, product_image_url = ?",
          "WHERE id = ?",
        ].join(" "),
        [
          targetQuantity,
          Number(normalizedUnitPrice.toFixed(2)),
          normalizedProductName,
          normalizedProductImageUrl,
          itemRows[0].id,
        ],
      );
    } else {
      await connection.execute(
        [
          "INSERT INTO cart_items",
          "(cart_id, product_id, product_name, product_image_url, quantity, unit_price)",
          "VALUES (?, ?, ?, ?, ?, ?)",
        ].join(" "),
        [
          cartId,
          normalizedProductId,
          normalizedProductName,
          normalizedProductImageUrl,
          normalizedQuantity,
          Number(normalizedUnitPrice.toFixed(2)),
        ],
      );
    }

    await connection.commit();
    return getCartByUserId(userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = { addProductToCart, getCartByUserId };
