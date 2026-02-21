const db = require("../config/db");
const { fetchMyCart } = require("../utils/cart.client");
const {
  reserveStockForOrder,
  releaseStockByOrderId,
  confirmStockByOrderId,
} = require("../utils/inventory.client");
const { normalizeRole } = require("../utils/userRole");

const ADMIN_ALLOWED_STATUSES = new Set([
  "paid",
  "shipped",
  "delivered",
  "cancelled",
]);

const STATUS_TRANSITIONS = {
  pending: new Set(["paid", "cancelled"]),
  paid: new Set(["shipped", "cancelled"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([]),
};

const createError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const toPositiveInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }

  return normalized;
};

const normalizeCurrency = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "USD";
  }

  return value.trim().toUpperCase().slice(0, 3);
};

const normalizeAdminStatus = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createError("Status is required", 400);
  }

  const normalized = value.trim().toLowerCase();
  if (!ADMIN_ALLOWED_STATUSES.has(normalized)) {
    throw createError(
      "Status must be one of: paid, shipped, delivered, cancelled",
      400,
    );
  }

  return normalized;
};

const mapOrderRow = (row) => ({
  id: row.id,
  userId: row.userId,
  status: row.status,
  currency: row.currency,
  itemsCount: Number(row.itemsCount),
  totalAmount: Number(row.totalAmount),
  cancelledAt: row.cancelledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapOrderItemRow = (item) => ({
  id: item.id,
  productId: item.productId,
  productName: item.productName,
  productImageUrl: item.productImageUrl,
  quantity: Number(item.quantity),
  unitPrice: Number(item.unitPrice),
  lineTotal: Number(item.lineTotal),
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const getOrderItemsByOrderId = async (executor, orderId) => {
  const [itemRows] = await executor.execute(
    [
      "SELECT",
      "id,",
      "product_id AS productId,",
      "product_name AS productName,",
      "product_image_url AS productImageUrl,",
      "quantity,",
      "unit_price AS unitPrice,",
      "line_total AS lineTotal,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM order_items",
      "WHERE order_id = ?",
      "ORDER BY id ASC",
    ].join(" "),
    [orderId],
  );

  return itemRows.map(mapOrderItemRow);
};

const getOrderById = async (orderId, { executor = db } = {}) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");

  const [orderRows] = await executor.execute(
    [
      "SELECT",
      "id,",
      "user_id AS userId,",
      "status,",
      "currency,",
      "items_count AS itemsCount,",
      "total_amount AS totalAmount,",
      "cancelled_at AS cancelledAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM orders",
      "WHERE id = ?",
      "LIMIT 1",
    ].join(" "),
    [normalizedOrderId],
  );

  if (!orderRows.length) return null;

  const order = mapOrderRow(orderRows[0]);
  const items = await getOrderItemsByOrderId(executor, normalizedOrderId);
  return {
    ...order,
    items,
  };
};

const getOrderForActor = async ({ orderId, actor }) => {
  const order = await getOrderById(orderId);
  if (!order) {
    throw createError("Order not found", 404);
  }

  const actorId = toPositiveInt(actor?.id, "user id");
  const actorRole = actor?.role;
  if (actorRole !== "admin" && actorId !== Number(order.userId)) {
    throw createError("Forbidden", 403);
  }

  return order;
};

const listOrdersByUserId = async (userId) => {
  const normalizedUserId = toPositiveInt(userId, "userId");

  const [orderRows] = await db.execute(
    [
      "SELECT",
      "id,",
      "user_id AS userId,",
      "status,",
      "currency,",
      "items_count AS itemsCount,",
      "total_amount AS totalAmount,",
      "cancelled_at AS cancelledAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM orders",
      "WHERE user_id = ?",
      "ORDER BY created_at DESC, id DESC",
    ].join(" "),
    [normalizedUserId],
  );

  if (!orderRows.length) return [];

  const orderIds = orderRows.map((row) => row.id);
  const placeholders = orderIds.map(() => "?").join(", ");
  const [itemRows] = await db.execute(
    [
      "SELECT",
      "id,",
      "order_id AS orderId,",
      "product_id AS productId,",
      "product_name AS productName,",
      "product_image_url AS productImageUrl,",
      "quantity,",
      "unit_price AS unitPrice,",
      "line_total AS lineTotal,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM order_items",
      `WHERE order_id IN (${placeholders})`,
      "ORDER BY id ASC",
    ].join(" "),
    orderIds,
  );

  const itemsByOrderId = new Map();
  for (const row of itemRows) {
    const item = mapOrderItemRow(row);
    const list = itemsByOrderId.get(row.orderId) || [];
    list.push(item);
    itemsByOrderId.set(row.orderId, list);
  }

  return orderRows.map((row) => ({
    ...mapOrderRow(row),
    items: itemsByOrderId.get(row.id) || [],
  }));
};

const createOrderFromCartItem = async ({
  actor,
  authorization,
  productId,
  quantity,
}) => {
  const userId = toPositiveInt(actor?.id, "user id");
  if (actor?.role !== "user") {
    throw createError("Only users can create orders", 403);
  }

  const normalizedProductId = toPositiveInt(productId, "productId");

  const cartLookup = await fetchMyCart({ authorization });
  if (!cartLookup.ok || !cartLookup.cart) {
    throw createError(
      cartLookup.message || "Cart unavailable",
      Number(cartLookup.status) || 502,
    );
  }

  const cart = cartLookup.cart;
  if (!Array.isArray(cart.items) || !cart.items.length) {
    throw createError("Cart is empty", 400);
  }

  const cartItem = cart.items.find(
    (item) => Number(item.productId) === normalizedProductId,
  );
  if (!cartItem) {
    throw createError(
      "Product must exist in your cart before creating an order",
      400,
    );
  }

  const availableQuantity = Number(cartItem.quantity);
  if (!Number.isInteger(availableQuantity) || availableQuantity <= 0) {
    throw createError("Invalid cart quantity for this product", 400);
  }

  let selectedQuantity = availableQuantity;
  if (quantity !== undefined && quantity !== null) {
    selectedQuantity = toPositiveInt(quantity, "quantity");
  }

  if (selectedQuantity > availableQuantity) {
    throw createError(
      `Only ${availableQuantity} item(s) available in cart for this product`,
      400,
    );
  }

  const unitPrice = Number(cartItem.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw createError("Invalid product price in cart", 400);
  }

  const lineTotal = Number((unitPrice * selectedQuantity).toFixed(2));
  const currency = normalizeCurrency(cart.currency);

  const connection = await db.getConnection();
  let createdOrderId = null;
  let inventoryReserved = false;

  try {
    await connection.beginTransaction();

    await connection.execute(
      [
        "INSERT INTO order_users (user_id, role)",
        "VALUES (?, ?)",
        "ON DUPLICATE KEY UPDATE",
        "role = VALUES(role),",
        "updated_at = CURRENT_TIMESTAMP",
      ].join(" "),
      [userId, normalizeRole(actor.role)],
    );

    const [orderResult] = await connection.execute(
      [
        "INSERT INTO orders (user_id, status, currency, items_count, total_amount)",
        "VALUES (?, 'pending', ?, ?, ?)",
      ].join(" "),
      [userId, currency, 1, lineTotal],
    );
    createdOrderId = Number(orderResult.insertId);

    const reserveResult = await reserveStockForOrder({
      orderId: createdOrderId,
      productId: normalizedProductId,
      quantity: selectedQuantity,
    });
    if (!reserveResult.ok) {
      throw createError(
        reserveResult.message || "Inventory reservation failed",
        Number(reserveResult.status) || 502,
      );
    }
    inventoryReserved = true;

    await connection.execute(
      [
        "INSERT INTO order_items",
        "(order_id, product_id, product_name, product_image_url, quantity, unit_price, line_total)",
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
      [
        createdOrderId,
        normalizedProductId,
        cartItem.productName,
        cartItem.productImageUrl,
        selectedQuantity,
        unitPrice,
        lineTotal,
      ],
    );

    await connection.commit();
    return getOrderById(createdOrderId);
  } catch (err) {
    await connection.rollback();

    if (createdOrderId && inventoryReserved) {
      const releaseResult = await releaseStockByOrderId({
        orderId: createdOrderId,
        reason: "order_create_rollback",
      });

      if (!releaseResult.ok) {
        console.error(
          `[order-service] failed to release reservation for rolled-back order ${createdOrderId}: ${releaseResult.message}`,
        );
      }
    }

    throw err;
  } finally {
    connection.release();
  }
};

const getOrderSummaryById = async (orderId, { executor = db } = {}) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");

  const [rows] = await executor.execute(
    [
      "SELECT",
      "id,",
      "user_id AS userId,",
      "status,",
      "currency,",
      "items_count AS itemsCount,",
      "total_amount AS totalAmount,",
      "cancelled_at AS cancelledAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM orders",
      "WHERE id = ?",
      "LIMIT 1",
    ].join(" "),
    [normalizedOrderId],
  );

  if (!rows.length) return null;
  return mapOrderRow(rows[0]);
};

const cancelOrder = async ({ orderId, actor }) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const actorId = toPositiveInt(actor?.id, "user id");
  const actorRole = actor?.role;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      [
        "SELECT id, user_id AS userId, status",
        "FROM orders",
        "WHERE id = ?",
        "LIMIT 1 FOR UPDATE",
      ].join(" "),
      [normalizedOrderId],
    );

    if (!rows.length) {
      throw createError("Order not found", 404);
    }

    const orderRow = rows[0];
    if (actorRole !== "admin" && actorId !== Number(orderRow.userId)) {
      throw createError("Forbidden", 403);
    }

    if (orderRow.status !== "cancelled" && orderRow.status !== "pending") {
      throw createError("Only pending orders can be cancelled", 400);
    }

    if (orderRow.status !== "cancelled") {
      await connection.execute(
        [
          "UPDATE orders",
          "SET status = 'cancelled', cancelled_at = NOW()",
          "WHERE id = ?",
        ].join(" "),
        [normalizedOrderId],
      );

      const releaseResult = await releaseStockByOrderId({
        orderId: normalizedOrderId,
        reason: "order_cancelled",
      });
      if (!releaseResult.ok) {
        throw createError(
          releaseResult.message || "Failed to release inventory reservation",
          Number(releaseResult.status) || 502,
        );
      }
    }

    await connection.commit();
    return getOrderById(normalizedOrderId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const updateOrderStatusByAdmin = async ({ orderId, actor, status }) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");

  if (actor?.role !== "admin") {
    throw createError("Only admin can update order status", 403);
  }

  const normalizedStatus = normalizeAdminStatus(status);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      [
        "SELECT id, status",
        "FROM orders",
        "WHERE id = ?",
        "LIMIT 1 FOR UPDATE",
      ].join(" "),
      [normalizedOrderId],
    );

    if (!rows.length) {
      throw createError("Order not found", 404);
    }

    const currentStatus = rows[0].status;
    if (currentStatus === normalizedStatus) {
      await connection.commit();
      return getOrderById(normalizedOrderId);
    }

    const nextAllowed = STATUS_TRANSITIONS[currentStatus] || new Set();
    if (!nextAllowed.has(normalizedStatus)) {
      throw createError(
        `Cannot change status from ${currentStatus} to ${normalizedStatus}`,
        400,
      );
    }

    if (normalizedStatus === "cancelled") {
      await connection.execute(
        [
          "UPDATE orders",
          "SET status = ?, cancelled_at = NOW()",
          "WHERE id = ?",
        ].join(" "),
        [normalizedStatus, normalizedOrderId],
      );

      const releaseResult = await releaseStockByOrderId({
        orderId: normalizedOrderId,
        reason: "order_cancelled",
      });
      if (!releaseResult.ok) {
        throw createError(
          releaseResult.message || "Failed to release inventory reservation",
          Number(releaseResult.status) || 502,
        );
      }
    } else {
      await connection.execute(
        [
          "UPDATE orders",
          "SET status = ?, cancelled_at = NULL",
          "WHERE id = ?",
        ].join(" "),
        [normalizedStatus, normalizedOrderId],
      );

      if (normalizedStatus === "shipped") {
        const confirmResult = await confirmStockByOrderId({
          orderId: normalizedOrderId,
        });
        if (!confirmResult.ok) {
          throw createError(
            confirmResult.message || "Failed to confirm inventory reservation",
            Number(confirmResult.status) || 502,
          );
        }
      }
    }

    await connection.commit();
    return getOrderById(normalizedOrderId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = {
  createOrderFromCartItem,
  listOrdersByUserId,
  getOrderById,
  getOrderSummaryById,
  getOrderForActor,
  cancelOrder,
  updateOrderStatusByAdmin,
};
