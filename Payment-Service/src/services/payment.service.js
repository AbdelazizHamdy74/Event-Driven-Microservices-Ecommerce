const db = require("../config/db");
const { createError } = require("../utils/errors");
const { fetchOrderExists, markOrderPaid } = require("../utils/order.client");
const { chargeWithProvider, normalizeProvider } = require("../providers");
const {
  publishPaymentCreated,
  publishPaymentSucceeded,
  publishPaymentFailed,
} = require("../events/payment.events");

const toPositiveInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }

  return normalized;
};

const toPositiveAmount = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }

  return Number(normalized.toFixed(2));
};

const normalizeCurrency = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "USD";
  }

  return value.trim().toUpperCase().slice(0, 3);
};

const normalizeOptionalText = (value, maxLength) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const normalizePaymentMethod = (value) =>
  normalizeOptionalText(value, 40) || "card";

const normalizeRole = (role) => {
  if (role === "admin") return "admin";
  if (role === "supplier") return "supplier";
  return "user";
};

const normalizeMetadata = (value) => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) || typeof value !== "object") {
    throw createError("metadata must be an object", 400);
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    throw createError("metadata must be serializable", 400);
  }
};

const parseJsonColumn = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const ensurePaymentUserProjection = async ({ userId, role }, { executor = db } = {}) => {
  const normalizedUserId = toPositiveInt(userId, "userId");
  await executor.execute(
    [
      "INSERT INTO payment_users (user_id, role)",
      "VALUES (?, ?)",
      "ON DUPLICATE KEY UPDATE",
      "role = VALUES(role),",
      "updated_at = CURRENT_TIMESTAMP",
    ].join(" "),
    [normalizedUserId, normalizeRole(role)],
  );
};

const mapPaymentRow = (row) => ({
  id: Number(row.id),
  orderId: Number(row.orderId),
  userId: Number(row.userId),
  provider: row.provider,
  providerPaymentId: row.providerPaymentId,
  status: row.status,
  currency: row.currency,
  amount: Number(row.amount),
  failureReason: row.failureReason,
  metadata: parseJsonColumn(row.metadata),
  paidAt: row.paidAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapUpstreamStatus = (status) => {
  const normalized = Number(status);
  if (normalized === 404) return 404;
  if (normalized === 400) return 400;
  if (normalized === 409) return 409;
  if (normalized === 401 || normalized === 403) return 502;
  if (normalized >= 500) return 502;
  if (normalized >= 400 && normalized < 500) return normalized;
  return 502;
};

const getPaymentById = async (paymentId, { executor = db } = {}) => {
  const normalizedPaymentId = toPositiveInt(paymentId, "paymentId");
  const [rows] = await executor.execute(
    [
      "SELECT",
      "id,",
      "order_id AS orderId,",
      "user_id AS userId,",
      "provider,",
      "provider_payment_id AS providerPaymentId,",
      "status,",
      "currency,",
      "amount,",
      "failure_reason AS failureReason,",
      "metadata,",
      "paid_at AS paidAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM payments",
      "WHERE id = ?",
      "LIMIT 1",
    ].join(" "),
    [normalizedPaymentId],
  );

  if (!rows.length) return null;
  return mapPaymentRow(rows[0]);
};

const getLatestSucceededPaymentByOrderId = async (orderId, { executor = db } = {}) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const [rows] = await executor.execute(
    [
      "SELECT",
      "id,",
      "order_id AS orderId,",
      "user_id AS userId,",
      "provider,",
      "provider_payment_id AS providerPaymentId,",
      "status,",
      "currency,",
      "amount,",
      "failure_reason AS failureReason,",
      "metadata,",
      "paid_at AS paidAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM payments",
      "WHERE order_id = ? AND status = 'succeeded'",
      "ORDER BY id DESC",
      "LIMIT 1",
    ].join(" "),
    [normalizedOrderId],
  );

  if (!rows.length) return null;
  return mapPaymentRow(rows[0]);
};

const listPaymentsByUserId = async (userId) => {
  const normalizedUserId = toPositiveInt(userId, "userId");
  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "order_id AS orderId,",
      "user_id AS userId,",
      "provider,",
      "provider_payment_id AS providerPaymentId,",
      "status,",
      "currency,",
      "amount,",
      "failure_reason AS failureReason,",
      "metadata,",
      "paid_at AS paidAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM payments",
      "WHERE user_id = ?",
      "ORDER BY id DESC",
    ].join(" "),
    [normalizedUserId],
  );

  return rows.map(mapPaymentRow);
};

const listPaymentsByOrderId = async (orderId) => {
  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "order_id AS orderId,",
      "user_id AS userId,",
      "provider,",
      "provider_payment_id AS providerPaymentId,",
      "status,",
      "currency,",
      "amount,",
      "failure_reason AS failureReason,",
      "metadata,",
      "paid_at AS paidAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM payments",
      "WHERE order_id = ?",
      "ORDER BY id DESC",
    ].join(" "),
    [normalizedOrderId],
  );

  return rows.map(mapPaymentRow);
};

const getPaymentForActor = async ({ paymentId, actor }) => {
  const normalizedPaymentId = toPositiveInt(paymentId, "paymentId");
  const payment = await getPaymentById(normalizedPaymentId);
  if (!payment) {
    throw createError("Payment not found", 404);
  }

  const actorId = toPositiveInt(actor?.id, "user id");
  if (actor?.role !== "admin" && actorId !== Number(payment.userId)) {
    throw createError("Forbidden", 403);
  }

  return payment;
};

const normalizeOrderSyncResult = (result, fromExistingPayment) => {
  if (result?.ok) {
    return {
      ok: true,
      status: Number(result.status) || 200,
      fromExistingPayment: Boolean(fromExistingPayment),
    };
  }

  return {
    ok: false,
    status: Number(result?.status) || 502,
    message: result?.message || "Order status sync failed",
    fromExistingPayment: Boolean(fromExistingPayment),
  };
};

const createPaymentForOrder = async ({
  actor,
  orderId,
  provider,
  paymentMethod,
  paymentToken,
  metadata,
}) => {
  const actorId = toPositiveInt(actor?.id, "user id");
  if (actor?.role !== "user") {
    throw createError("Only users can create payments", 403);
  }

  const normalizedOrderId = toPositiveInt(orderId, "orderId");
  const providerInput =
    provider ||
    process.env.PAYMENT_PROVIDER ||
    process.env.DEFAULT_PAYMENT_PROVIDER ||
    "stripe";

  let normalizedProvider;
  try {
    normalizedProvider = normalizeProvider(providerInput);
  } catch (_error) {
    throw createError("provider must be either stripe or paymob", 400);
  }

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const normalizedPaymentToken = normalizeOptionalText(paymentToken, 255);
  const normalizedMetadata = normalizeMetadata(metadata);

  const orderLookup = await fetchOrderExists({ orderId: normalizedOrderId });
  if (!orderLookup.ok || !orderLookup.order) {
    if (Number(orderLookup.status) === 404) {
      throw createError("Order not found", 404);
    }

    throw createError(
      orderLookup.message || "Order service unavailable",
      mapUpstreamStatus(orderLookup.status),
    );
  }

  const order = orderLookup.order;
  if (Number(order.userId) !== actorId) {
    throw createError("Forbidden", 403);
  }

  const orderStatus =
    typeof order.status === "string" ? order.status.trim().toLowerCase() : "";

  if (orderStatus === "cancelled") {
    throw createError("Cannot pay a cancelled order", 409);
  }

  await ensurePaymentUserProjection({
    userId: actorId,
    role: actor.role,
  });

  const existingSucceededPayment = await getLatestSucceededPaymentByOrderId(
    normalizedOrderId,
  );
  if (existingSucceededPayment) {
    const orderSyncResult = await markOrderPaid({
      orderId: normalizedOrderId,
      paymentId: existingSucceededPayment.id,
      provider: existingSucceededPayment.provider,
      providerPaymentId: existingSucceededPayment.providerPaymentId,
    });

    return {
      payment: existingSucceededPayment,
      orderSync: normalizeOrderSyncResult(orderSyncResult, true),
    };
  }

  if (orderStatus !== "pending") {
    throw createError(`Cannot pay an order in ${orderStatus || "unknown"} status`, 409);
  }

  const amount = toPositiveAmount(order.totalAmount, "order total amount");
  const currency = normalizeCurrency(order.currency);
  const paymentMetadata = parseJsonColumn(normalizedMetadata) || {};
  paymentMetadata.paymentMethod = normalizedPaymentMethod;

  const [insertResult] = await db.execute(
    [
      "INSERT INTO payments",
      "(order_id, user_id, provider, status, currency, amount, metadata)",
      "VALUES (?, ?, ?, 'pending', ?, ?, ?)",
    ].join(" "),
    [
      normalizedOrderId,
      actorId,
      normalizedProvider,
      currency,
      amount,
      JSON.stringify(paymentMetadata),
    ],
  );

  const paymentId = Number(insertResult.insertId);
  let payment = await getPaymentById(paymentId);
  if (!payment) {
    throw createError("Failed to create payment", 500);
  }

  await publishPaymentCreated(payment);

  const gatewayResult = await chargeWithProvider({
    provider: normalizedProvider,
    paymentId,
    orderId: normalizedOrderId,
    userId: actorId,
    amount,
    currency,
    paymentMethod: normalizedPaymentMethod,
    paymentToken: normalizedPaymentToken,
  });

  if (!gatewayResult.ok || gatewayResult.status !== "succeeded") {
    const failureReason =
      normalizeOptionalText(
        gatewayResult.failureReason ||
          gatewayResult.message ||
          "Payment authorization failed",
        255,
      ) || "Payment authorization failed";

    await db.execute(
      [
        "UPDATE payments",
        "SET status = 'failed', provider_payment_id = ?, failure_reason = ?, paid_at = NULL",
        "WHERE id = ?",
      ].join(" "),
      [
        normalizeOptionalText(gatewayResult.providerPaymentId, 128),
        failureReason,
        paymentId,
      ],
    );

    payment = await getPaymentById(paymentId);
    if (!payment) {
      throw createError("Failed to update payment status", 500);
    }

    await publishPaymentFailed(payment);

    return {
      payment,
      orderSync: {
        ok: false,
        skipped: true,
        reason: "payment_failed",
      },
    };
  }

  await db.execute(
    [
      "UPDATE payments",
      "SET status = 'succeeded', provider_payment_id = ?, failure_reason = NULL, paid_at = NOW()",
      "WHERE id = ?",
    ].join(" "),
    [normalizeOptionalText(gatewayResult.providerPaymentId, 128), paymentId],
  );

  payment = await getPaymentById(paymentId);
  if (!payment) {
    throw createError("Failed to finalize payment", 500);
  }

  const orderSyncResult = await markOrderPaid({
    orderId: normalizedOrderId,
    paymentId: payment.id,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
  });
  const orderSync = normalizeOrderSyncResult(orderSyncResult, false);

  await publishPaymentSucceeded(payment, { orderSync });

  return {
    payment,
    orderSync,
  };
};

module.exports = {
  createPaymentForOrder,
  listPaymentsByUserId,
  listPaymentsByOrderId,
  getPaymentForActor,
};
