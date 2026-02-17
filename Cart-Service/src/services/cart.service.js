const db = require("../config/db");
const { fetchProductForCart } = require("../utils/productCatalog.client");

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

const addProductToCart = async ({ userId, productId, quantity }) => {
  const normalizedProductId = Number(productId);
  const normalizedQuantity = Number(quantity);

  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    throw createError("Invalid productId", 400);
  }

  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    throw createError("Quantity must be a positive integer", 400);
  }

  const productLookup = await fetchProductForCart({
    productId: normalizedProductId,
  });

  if (!productLookup.ok || !productLookup.product) {
    throw createError(
      productLookup.message || "Product unavailable",
      Number(productLookup.status) || 404,
    );
  }

  const product = productLookup.product;
  const availableStock = Number(product.stockQuantity);
  if (!Number.isFinite(availableStock) || availableStock <= 0) {
    throw createError("Product out of stock", 400);
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

    if (targetQuantity > availableStock) {
      throw createError(
        `Available stock is ${availableStock}, requested ${targetQuantity}`,
        400,
      );
    }

    if (itemRows.length) {
      await connection.execute(
        [
          "UPDATE cart_items",
          "SET quantity = ?, unit_price = ?, product_name = ?, product_image_url = ?",
          "WHERE id = ?",
        ].join(" "),
        [
          targetQuantity,
          Number(product.price),
          product.name,
          product.imageUrl,
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
          product.name,
          product.imageUrl,
          normalizedQuantity,
          Number(product.price),
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
