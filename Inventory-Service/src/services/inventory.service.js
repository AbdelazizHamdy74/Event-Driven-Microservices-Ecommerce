const db = require("../config/db");
const { createError } = require("../utils/errors");
const { fetchProductExists } = require("../utils/product.client");
const { fetchOrderExists } = require("../utils/order.client");

const ACTIVE_STATUS = "active";
const RELEASED_STATUS = "released";
const CONFIRMED_STATUS = "confirmed";
const EXPIRED_STATUS = "expired";

const toPositiveInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }

  return normalized;
};

const toNonNegativeInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw createError(`${fieldName} must be a non-negative integer`, 400);
  }

  return normalized;
};

const normalizeReleaseReason = (value, fallback) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, 80);
};

const normalizeExpiresAt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError("expiresAt must be a valid ISO date-time", 400);
  }

  return parsed;
};

const mapInventoryRow = (row) => {
  const totalQuantity = Number(row.totalQuantity);
  const reservedQuantity = Number(row.reservedQuantity);

  return {
    productId: Number(row.productId),
    totalQuantity,
    reservedQuantity,
    availableQuantity: Math.max(totalQuantity - reservedQuantity, 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const mapReservationRow = (row) => ({
  id: Number(row.id),
  orderId: Number(row.orderId),
  productId: Number(row.productId),
  quantity: Number(row.quantity),
  status: row.status,
  expiresAt: row.expiresAt,
  releaseReason: row.releaseReason,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapUpstreamStatus = (status) => {
  const normalized = Number(status);
  if (normalized === 404) return 404;
  if (normalized === 400) return 400;
  if (normalized === 401 || normalized === 403) return 502;
  if (normalized >= 500) return 502;
  if (normalized >= 400 && normalized < 500) return normalized;
  return 502;
};

const assertProductExists = async (productId) => {
  const result = await fetchProductExists({ productId });
  if (result.ok) return;

  if (Number(result.status) === 404) {
    throw createError("Product not found", 404);
  }

  throw createError(
    result.message || "Failed to verify productId",
    mapUpstreamStatus(result.status),
  );
};

const assertOrderExists = async (orderId) => {
  const result = await fetchOrderExists({ orderId });
  if (result.ok) return;

  if (Number(result.status) === 404) {
    throw createError("Order not found", 404);
  }

  throw createError(
    result.message || "Failed to verify orderId",
    mapUpstreamStatus(result.status),
  );
};

const getInventoryByProductId = async (
  productId,
  { executor = db, forUpdate = false } = {},
) => {
  const normalizedProductId = toPositiveInt(productId, "productId");
  const query = [
    "SELECT",
    "product_id AS productId,",
    "total_quantity AS totalQuantity,",
    "reserved_quantity AS reservedQuantity,",
    "created_at AS createdAt,",
    "updated_at AS updatedAt",
    "FROM inventory_items",
    "WHERE product_id = ?",
    "LIMIT 1",
  ];

  if (forUpdate) {
    query.push("FOR UPDATE");
  }

  const [rows] = await executor.execute(query.join(" "), [normalizedProductId]);
  if (!rows.length) return null;
  return mapInventoryRow(rows[0]);
};

const getReservationById = async (
  reservationId,
  { executor = db, forUpdate = false } = {},
) => {
  const normalizedReservationId = toPositiveInt(reservationId, "reservationId");
  const query = [
    "SELECT",
    "id,",
    "order_id AS orderId,",
    "product_id AS productId,",
    "quantity,",
    "status,",
    "expires_at AS expiresAt,",
    "release_reason AS releaseReason,",
    "created_at AS createdAt,",
    "updated_at AS updatedAt",
    "FROM inventory_reservations",
    "WHERE id = ?",
    "LIMIT 1",
  ];

  if (forUpdate) {
    query.push("FOR UPDATE");
  }

  const [rows] = await executor.execute(query.join(" "), [
    normalizedReservationId,
  ]);

  if (!rows.length) return null;
  return mapReservationRow(rows[0]);
};

const getActiveReservationByOrderAndProduct = async ({
  orderId,
  productId,
  executor = db,
  forUpdate = false,
}) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const normalizedProductId = toPositiveInt(productId, "productId");
  const query = [
    "SELECT",
    "id,",
    "order_id AS orderId,",
    "product_id AS productId,",
    "quantity,",
    "status,",
    "expires_at AS expiresAt,",
    "release_reason AS releaseReason,",
    "created_at AS createdAt,",
    "updated_at AS updatedAt",
    "FROM inventory_reservations",
    "WHERE order_id = ? AND product_id = ? AND status = ?",
    "LIMIT 1",
  ];

  if (forUpdate) {
    query.push("FOR UPDATE");
  }

  const [rows] = await executor.execute(query.join(" "), [
    normalizedOrderId,
    normalizedProductId,
    ACTIVE_STATUS,
  ]);

  if (!rows.length) return null;
  return mapReservationRow(rows[0]);
};

const getActiveReservationsByOrderId = async ({
  orderId,
  executor = db,
  forUpdate = false,
}) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const query = [
    "SELECT",
    "id,",
    "order_id AS orderId,",
    "product_id AS productId,",
    "quantity,",
    "status,",
    "expires_at AS expiresAt,",
    "release_reason AS releaseReason,",
    "created_at AS createdAt,",
    "updated_at AS updatedAt",
    "FROM inventory_reservations",
    "WHERE order_id = ? AND status = ?",
    "ORDER BY id ASC",
  ];

  if (forUpdate) {
    query.push("FOR UPDATE");
  }

  const [rows] = await executor.execute(query.join(" "), [
    normalizedOrderId,
    ACTIVE_STATUS,
  ]);

  return rows.map(mapReservationRow);
};

const getReservationsByOrderId = async (orderId, { executor = db } = {}) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const [rows] = await executor.execute(
    [
      "SELECT",
      "id,",
      "order_id AS orderId,",
      "product_id AS productId,",
      "quantity,",
      "status,",
      "expires_at AS expiresAt,",
      "release_reason AS releaseReason,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM inventory_reservations",
      "WHERE order_id = ?",
      "ORDER BY id ASC",
    ].join(" "),
    [normalizedOrderId],
  );

  return rows.map(mapReservationRow);
};

const upsertStockByProductId = async ({ productId, totalQuantity }) => {
  const normalizedProductId = toPositiveInt(productId, "productId");
  const normalizedTotalQuantity = toNonNegativeInt(totalQuantity, "totalQuantity");
  await assertProductExists(normalizedProductId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const existing = await getInventoryByProductId(normalizedProductId, {
      executor: connection,
      forUpdate: true,
    });

    if (!existing) {
      await connection.execute(
        [
          "INSERT INTO inventory_items",
          "(product_id, total_quantity, reserved_quantity)",
          "VALUES (?, ?, 0)",
        ].join(" "),
        [normalizedProductId, normalizedTotalQuantity],
      );
    } else {
      if (normalizedTotalQuantity < existing.reservedQuantity) {
        throw createError(
          `totalQuantity cannot be less than reservedQuantity (${existing.reservedQuantity})`,
          400,
        );
      }

      await connection.execute(
        [
          "UPDATE inventory_items",
          "SET total_quantity = ?",
          "WHERE product_id = ?",
        ].join(" "),
        [normalizedTotalQuantity, normalizedProductId],
      );
    }

    await connection.commit();
    return getInventoryByProductId(normalizedProductId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const reserveStock = async ({ orderId, productId, quantity, expiresAt }) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const normalizedProductId = toPositiveInt(productId, "productId");
  const normalizedQuantity = toPositiveInt(quantity, "quantity");
  const normalizedExpiresAt = normalizeExpiresAt(expiresAt);
  await assertProductExists(normalizedProductId);
  await assertOrderExists(normalizedOrderId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const inventoryItem = await getInventoryByProductId(normalizedProductId, {
      executor: connection,
      forUpdate: true,
    });

    if (!inventoryItem) {
      throw createError("Inventory item not found", 404);
    }

    const existingReservation = await getActiveReservationByOrderAndProduct({
      orderId: normalizedOrderId,
      productId: normalizedProductId,
      executor: connection,
      forUpdate: true,
    });

    if (existingReservation) {
      if (existingReservation.quantity !== normalizedQuantity) {
        throw createError(
          "Active reservation already exists with different quantity",
          409,
        );
      }

      await connection.commit();
      return {
        reservation: existingReservation,
        inventory: inventoryItem,
      };
    }

    if (inventoryItem.availableQuantity < normalizedQuantity) {
      throw createError(
        `Insufficient stock. Available quantity: ${inventoryItem.availableQuantity}`,
        409,
      );
    }

    const [insertResult] = await connection.execute(
      [
        "INSERT INTO inventory_reservations",
        "(order_id, product_id, quantity, status, expires_at)",
        "VALUES (?, ?, ?, ?, ?)",
      ].join(" "),
      [
        normalizedOrderId,
        normalizedProductId,
        normalizedQuantity,
        ACTIVE_STATUS,
        normalizedExpiresAt,
      ],
    );

    await connection.execute(
      [
        "UPDATE inventory_items",
        "SET reserved_quantity = reserved_quantity + ?",
        "WHERE product_id = ?",
      ].join(" "),
      [normalizedQuantity, normalizedProductId],
    );

    await connection.commit();

    return {
      reservation: await getReservationById(insertResult.insertId),
      inventory: await getInventoryByProductId(normalizedProductId),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const releaseReservationById = async ({ reservationId, reason }) => {
  const normalizedReservationId = toPositiveInt(reservationId, "reservationId");
  const normalizedReason = normalizeReleaseReason(reason, "manual_release");
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const reservation = await getReservationById(normalizedReservationId, {
      executor: connection,
      forUpdate: true,
    });

    if (!reservation) {
      throw createError("Reservation not found", 404);
    }

    if (reservation.status !== ACTIVE_STATUS) {
      await connection.commit();
      return {
        reservation,
        inventory: await getInventoryByProductId(reservation.productId),
      };
    }

    await getInventoryByProductId(reservation.productId, {
      executor: connection,
      forUpdate: true,
    });

    await connection.execute(
      [
        "UPDATE inventory_items",
        "SET reserved_quantity =",
        "CASE",
        "WHEN reserved_quantity >= ? THEN reserved_quantity - ?",
        "ELSE 0",
        "END",
        "WHERE product_id = ?",
      ].join(" "),
      [reservation.quantity, reservation.quantity, reservation.productId],
    );

    await connection.execute(
      [
        "UPDATE inventory_reservations",
        "SET status = ?, release_reason = ?",
        "WHERE id = ?",
      ].join(" "),
      [RELEASED_STATUS, normalizedReason, normalizedReservationId],
    );

    await connection.commit();
    return {
      reservation: await getReservationById(normalizedReservationId),
      inventory: await getInventoryByProductId(reservation.productId),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const releaseReservationsByOrderId = async ({ orderId, reason }) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const normalizedReason = normalizeReleaseReason(reason, "order_cancelled");
  await assertOrderExists(normalizedOrderId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const activeReservations = await getActiveReservationsByOrderId({
      orderId: normalizedOrderId,
      executor: connection,
      forUpdate: true,
    });

    if (!activeReservations.length) {
      await connection.commit();
      return {
        orderId: normalizedOrderId,
        releasedCount: 0,
        releasedQuantity: 0,
        reservations: [],
      };
    }

    const quantityByProductId = new Map();
    for (const reservation of activeReservations) {
      quantityByProductId.set(
        reservation.productId,
        (quantityByProductId.get(reservation.productId) || 0) + reservation.quantity,
      );
    }

    for (const [productId, quantity] of quantityByProductId.entries()) {
      await getInventoryByProductId(productId, {
        executor: connection,
        forUpdate: true,
      });

      await connection.execute(
        [
          "UPDATE inventory_items",
          "SET reserved_quantity =",
          "CASE",
          "WHEN reserved_quantity >= ? THEN reserved_quantity - ?",
          "ELSE 0",
          "END",
          "WHERE product_id = ?",
        ].join(" "),
        [quantity, quantity, productId],
      );
    }

    const reservationIds = activeReservations.map((item) => item.id);
    const placeholders = reservationIds.map(() => "?").join(", ");
    await connection.execute(
      [
        "UPDATE inventory_reservations",
        "SET status = ?, release_reason = ?",
        `WHERE id IN (${placeholders})`,
      ].join(" "),
      [RELEASED_STATUS, normalizedReason, ...reservationIds],
    );

    await connection.commit();

    return {
      orderId: normalizedOrderId,
      releasedCount: reservationIds.length,
      releasedQuantity: activeReservations.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      reservations: await getReservationsByOrderId(normalizedOrderId),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const confirmReservationsByOrderId = async ({ orderId }) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  await assertOrderExists(normalizedOrderId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const activeReservations = await getActiveReservationsByOrderId({
      orderId: normalizedOrderId,
      executor: connection,
      forUpdate: true,
    });

    if (!activeReservations.length) {
      await connection.commit();
      return {
        orderId: normalizedOrderId,
        confirmedCount: 0,
        confirmedQuantity: 0,
        reservations: [],
      };
    }

    for (const reservation of activeReservations) {
      const inventoryItem = await getInventoryByProductId(reservation.productId, {
        executor: connection,
        forUpdate: true,
      });

      if (!inventoryItem) {
        throw createError(
          `Inventory item not found for productId ${reservation.productId}`,
          404,
        );
      }

      if (
        inventoryItem.totalQuantity < reservation.quantity ||
        inventoryItem.reservedQuantity < reservation.quantity
      ) {
        throw createError(
          `Inventory state conflict for productId ${reservation.productId}`,
          409,
        );
      }

      await connection.execute(
        [
          "UPDATE inventory_items",
          "SET total_quantity = total_quantity - ?,",
          "reserved_quantity = reserved_quantity - ?",
          "WHERE product_id = ?",
        ].join(" "),
        [reservation.quantity, reservation.quantity, reservation.productId],
      );
    }

    const reservationIds = activeReservations.map((item) => item.id);
    const placeholders = reservationIds.map(() => "?").join(", ");
    await connection.execute(
      [
        "UPDATE inventory_reservations",
        "SET status = ?, release_reason = ?",
        `WHERE id IN (${placeholders})`,
      ].join(" "),
      [CONFIRMED_STATUS, "order_confirmed", ...reservationIds],
    );

    await connection.commit();
    return {
      orderId: normalizedOrderId,
      confirmedCount: reservationIds.length,
      confirmedQuantity: activeReservations.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      reservations: await getReservationsByOrderId(normalizedOrderId),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const releaseExpiredReservations = async () => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      [
        "SELECT",
        "id,",
        "order_id AS orderId,",
        "product_id AS productId,",
        "quantity,",
        "status,",
        "expires_at AS expiresAt,",
        "release_reason AS releaseReason,",
        "created_at AS createdAt,",
        "updated_at AS updatedAt",
        "FROM inventory_reservations",
        "WHERE status = ?",
        "AND expires_at IS NOT NULL",
        "AND expires_at <= NOW()",
        "ORDER BY id ASC",
        "FOR UPDATE",
      ].join(" "),
      [ACTIVE_STATUS],
    );

    const activeExpiredReservations = rows.map(mapReservationRow);
    if (!activeExpiredReservations.length) {
      await connection.commit();
      return {
        expiredCount: 0,
        expiredQuantity: 0,
        reservationIds: [],
      };
    }

    const quantityByProductId = new Map();
    for (const reservation of activeExpiredReservations) {
      quantityByProductId.set(
        reservation.productId,
        (quantityByProductId.get(reservation.productId) || 0) + reservation.quantity,
      );
    }

    for (const [productId, quantity] of quantityByProductId.entries()) {
      await getInventoryByProductId(productId, {
        executor: connection,
        forUpdate: true,
      });

      await connection.execute(
        [
          "UPDATE inventory_items",
          "SET reserved_quantity =",
          "CASE",
          "WHEN reserved_quantity >= ? THEN reserved_quantity - ?",
          "ELSE 0",
          "END",
          "WHERE product_id = ?",
        ].join(" "),
        [quantity, quantity, productId],
      );
    }

    const reservationIds = activeExpiredReservations.map((item) => item.id);
    const placeholders = reservationIds.map(() => "?").join(", ");
    await connection.execute(
      [
        "UPDATE inventory_reservations",
        "SET status = ?, release_reason = ?",
        `WHERE id IN (${placeholders})`,
      ].join(" "),
      [EXPIRED_STATUS, "order_timeout", ...reservationIds],
    );

    await connection.commit();
    return {
      expiredCount: reservationIds.length,
      expiredQuantity: activeExpiredReservations.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      reservationIds,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = {
  getInventoryByProductId,
  upsertStockByProductId,
  reserveStock,
  releaseReservationById,
  releaseReservationsByOrderId,
  confirmReservationsByOrderId,
  releaseExpiredReservations,
};
