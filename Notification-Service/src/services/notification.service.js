const db = require("../config/db");
const { createError } = require("../utils/errors");
const { normalizeRole } = require("../utils/userRole");

const SUPPORTED_CHANNELS = ["email", "sms", "push"];
const SUPPORTED_PAYMENT_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
]);

const toPositiveInt = (value, fieldName) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }

  return normalized;
};

const toBoundedLimit = (value, fallback = 50) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError("Invalid limit", 400);
  }

  return Math.min(normalized, 200);
};

const toNullableText = (value, maxLength) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
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

const normalizeChannels = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return SUPPORTED_CHANNELS;
  }

  const channels = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => SUPPORTED_CHANNELS.includes(item));

  if (!channels.length) return SUPPORTED_CHANNELS;
  return [...new Set(channels)];
};

const normalizeCurrency = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "USD";
  }

  return value.trim().toUpperCase().slice(0, 3);
};

const mapNotificationRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.userId),
  channel: row.channel,
  sourceEventId: row.sourceEventId,
  sourceEventType: row.sourceEventType,
  title: row.title,
  body: row.body,
  metadata: parseJsonColumn(row.metadata),
  deliveryStatus: row.deliveryStatus,
  isRead: Boolean(row.isRead),
  readAt: row.readAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const ensureNotificationUserProjection = async (
  { userId, role },
  { executor = db } = {},
) => {
  const normalizedUserId = toPositiveInt(userId, "userId");
  await executor.execute(
    [
      "INSERT INTO notification_users (user_id, role)",
      "VALUES (?, ?)",
      "ON DUPLICATE KEY UPDATE",
      "role = VALUES(role),",
      "updated_at = CURRENT_TIMESTAMP",
    ].join(" "),
    [normalizedUserId, normalizeRole(role)],
  );
};

const formatAmount = (amount, currency) => {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount)) {
    return null;
  }

  return `${normalizeCurrency(currency)} ${normalizedAmount.toFixed(2)}`;
};

const buildPaymentTemplate = ({ eventType, data }) => {
  const orderId = Number(data.orderId);
  const orderLabel =
    Number.isInteger(orderId) && orderId > 0
      ? `order #${orderId}`
      : "your order";
  const amountLabel = formatAmount(data.amount, data.currency);
  const provider = toNullableText(data.provider, 40) || "payment provider";
  const failureReason = toNullableText(data.failureReason, 255);

  if (eventType === "PAYMENT_CREATED") {
    return {
      title: "Payment initiated",
      body: amountLabel
        ? `Payment for ${orderLabel} (${amountLabel}) is being processed via ${provider}.`
        : `Payment for ${orderLabel} is being processed via ${provider}.`,
    };
  }

  if (eventType === "PAYMENT_SUCCEEDED") {
    return {
      title: "Payment successful",
      body: amountLabel
        ? `Payment for ${orderLabel} (${amountLabel}) was completed successfully.`
        : `Payment for ${orderLabel} was completed successfully.`,
    };
  }

  return {
    title: "Payment failed",
    body: failureReason
      ? `Payment for ${orderLabel} failed: ${failureReason}.`
      : `Payment for ${orderLabel} failed. Please try again.`,
  };
};

const createNotificationsFromPaymentEvent = async ({
  eventId,
  eventType,
  occurredAt,
  data,
}) => {
  if (!SUPPORTED_PAYMENT_EVENTS.has(eventType)) {
    return { count: 0, channels: [] };
  }

  const userId = toPositiveInt(data?.userId, "userId");
  await ensureNotificationUserProjection({
    userId,
    role: data?.userRole || "user",
  });

  const channels = normalizeChannels(process.env.NOTIFICATION_CHANNELS);
  if (!channels.length) {
    return { count: 0, channels: [] };
  }

  const template = buildPaymentTemplate({
    eventType,
    data: data || {},
  });

  const sourceEventId = toNullableText(eventId, 64);
  const metadataBase = {
    source: "payment-events",
    eventType,
    eventId: sourceEventId,
    occurredAt:
      typeof occurredAt === "string" && occurredAt.trim()
        ? occurredAt
        : new Date().toISOString(),
    paymentId:
      Number.isInteger(Number(data?.paymentId)) && Number(data.paymentId) > 0
        ? Number(data.paymentId)
        : null,
    orderId:
      Number.isInteger(Number(data?.orderId)) && Number(data.orderId) > 0
        ? Number(data.orderId)
        : null,
    userId,
    provider: toNullableText(data?.provider, 40),
    status: toNullableText(data?.status, 32),
    currency: normalizeCurrency(data?.currency),
    amount:
      Number.isFinite(Number(data?.amount)) && Number(data.amount) > 0
        ? Number(Number(data.amount).toFixed(2))
        : null,
    failureReason: toNullableText(data?.failureReason, 255),
    orderSync:
      data?.orderSync && typeof data.orderSync === "object" ? data.orderSync : null,
  };

  const placeholders = channels
    .map(() => "(?, ?, ?, ?, ?, ?, ?, 'sent')")
    .join(", ");
  const params = [];

  for (const channel of channels) {
    params.push(
      userId,
      channel,
      sourceEventId,
      eventType,
      template.title,
      template.body,
      JSON.stringify({
        ...metadataBase,
        channel,
      }),
    );
  }

  await db.execute(
    [
      "INSERT INTO notifications",
      "(user_id, channel, source_event_id, source_event_type, title, body, metadata, delivery_status)",
      "VALUES",
      placeholders,
      "ON DUPLICATE KEY UPDATE",
      "title = VALUES(title),",
      "body = VALUES(body),",
      "metadata = VALUES(metadata),",
      "delivery_status = VALUES(delivery_status),",
      "updated_at = CURRENT_TIMESTAMP",
    ].join(" "),
    params,
  );

  return {
    count: channels.length,
    channels,
  };
};

const listNotificationsByUserId = async ({ userId, limit = 50 }) => {
  const normalizedUserId = toPositiveInt(userId, "userId");
  const normalizedLimit = toBoundedLimit(limit, 50);

  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "user_id AS userId,",
      "channel,",
      "source_event_id AS sourceEventId,",
      "source_event_type AS sourceEventType,",
      "title,",
      "body,",
      "metadata,",
      "delivery_status AS deliveryStatus,",
      "is_read AS isRead,",
      "read_at AS readAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM notifications",
      "WHERE user_id = ?",
      "ORDER BY id DESC",
      "LIMIT ?",
    ].join(" "),
    [normalizedUserId, normalizedLimit],
  );

  return rows.map(mapNotificationRow);
};

const getNotificationById = async (notificationId) => {
  const normalizedNotificationId = toPositiveInt(notificationId, "notificationId");
  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "user_id AS userId,",
      "channel,",
      "source_event_id AS sourceEventId,",
      "source_event_type AS sourceEventType,",
      "title,",
      "body,",
      "metadata,",
      "delivery_status AS deliveryStatus,",
      "is_read AS isRead,",
      "read_at AS readAt,",
      "created_at AS createdAt,",
      "updated_at AS updatedAt",
      "FROM notifications",
      "WHERE id = ?",
      "LIMIT 1",
    ].join(" "),
    [normalizedNotificationId],
  );

  if (!rows.length) return null;
  return mapNotificationRow(rows[0]);
};

const listNotificationsForActor = async ({ actor, userId, limit = 50 }) => {
  const normalizedTargetUserId = toPositiveInt(userId, "userId");
  const actorId = toPositiveInt(actor?.id, "user id");

  if (actor?.role !== "admin" && actorId !== normalizedTargetUserId) {
    throw createError("Forbidden", 403);
  }

  return listNotificationsByUserId({
    userId: normalizedTargetUserId,
    limit,
  });
};

const markNotificationReadForActor = async ({ notificationId, actor }) => {
  const normalizedNotificationId = toPositiveInt(notificationId, "notificationId");
  const actorId = toPositiveInt(actor?.id, "user id");

  const currentNotification = await getNotificationById(normalizedNotificationId);
  if (!currentNotification) {
    throw createError("Notification not found", 404);
  }

  if (actor?.role !== "admin" && actorId !== Number(currentNotification.userId)) {
    throw createError("Forbidden", 403);
  }

  if (!currentNotification.isRead) {
    await db.execute(
      [
        "UPDATE notifications",
        "SET is_read = 1,",
        "read_at = COALESCE(read_at, NOW())",
        "WHERE id = ?",
      ].join(" "),
      [normalizedNotificationId],
    );
  }

  const updatedNotification = await getNotificationById(normalizedNotificationId);
  if (!updatedNotification) {
    throw createError("Notification not found", 404);
  }

  return updatedNotification;
};

module.exports = {
  SUPPORTED_PAYMENT_EVENTS,
  createNotificationsFromPaymentEvent,
  listNotificationsForActor,
  markNotificationReadForActor,
};
