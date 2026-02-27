const {
  createNotificationsFromPaymentEvent,
  SUPPORTED_PAYMENT_EVENTS,
} = require("../services/notification.service");

const PAYMENT_EVENTS_TOPIC =
  process.env.KAFKA_PAYMENT_EVENTS_TOPIC || "payment-events";

const toNullableNumber = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  return normalized;
};

const parsePaymentEvent = (message) => {
  if (!message.value) return null;

  let parsedValue;
  try {
    parsedValue = JSON.parse(message.value.toString());
  } catch (err) {
    console.error("[notification-service] invalid payment event JSON", err);
    return null;
  }

  const eventType = parsedValue.eventType || parsedValue.event;
  if (!SUPPORTED_PAYMENT_EVENTS.has(eventType)) {
    return null;
  }

  const data = parsedValue.data || parsedValue.payload || {};
  const userId = Number(data.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error(
      "[notification-service] invalid userId in payment event",
      parsedValue,
    );
    return null;
  }

  return {
    eventId:
      typeof parsedValue.eventId === "string" ? parsedValue.eventId.trim() : null,
    eventType,
    occurredAt: parsedValue.occurredAt,
    data: {
      userId,
      paymentId: toNullableNumber(data.paymentId),
      orderId: toNullableNumber(data.orderId),
      provider: data.provider,
      status: data.status,
      currency: data.currency,
      amount: toNullableNumber(data.amount),
      failureReason: data.failureReason,
      orderSync:
        data.orderSync && typeof data.orderSync === "object"
          ? data.orderSync
          : null,
    },
  };
};

const handlePaymentEventMessage = async ({ topic, partition, message }) => {
  const payload = parsePaymentEvent(message);
  if (!payload) return;

  const result = await createNotificationsFromPaymentEvent(payload);
  console.log(
    `[notification-service] ${payload.eventType} handled userId=${payload.data.userId} notifications=${result.count} topic=${topic} partition=${partition} offset=${message.offset}`,
  );
};

module.exports = {
  PAYMENT_EVENTS_TOPIC,
  handlePaymentEventMessage,
};
