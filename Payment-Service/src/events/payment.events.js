const crypto = require("crypto");
const { producer } = require("../config/kafka");

const PAYMENT_EVENTS_TOPIC =
  process.env.KAFKA_PAYMENT_EVENTS_TOPIC || "payment-events";
const PAYMENT_CREATED_EVENT = "PAYMENT_CREATED";
const PAYMENT_SUCCEEDED_EVENT = "PAYMENT_SUCCEEDED";
const PAYMENT_FAILED_EVENT = "PAYMENT_FAILED";
const EVENT_VERSION = 1;

const buildEventId = () => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
};

const toEventPayload = (payment, extra = {}) => ({
  paymentId: Number(payment.id),
  orderId: Number(payment.orderId),
  userId: Number(payment.userId),
  provider: payment.provider,
  providerPaymentId: payment.providerPaymentId || null,
  status: payment.status,
  currency: payment.currency,
  amount: Number(payment.amount),
  failureReason: payment.failureReason || null,
  paidAt: payment.paidAt || null,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
  ...extra,
});

const publishPaymentEvent = async (eventType, payment, extra = {}) => {
  const data = toEventPayload(payment, extra);

  await producer.send({
    topic: PAYMENT_EVENTS_TOPIC,
    messages: [
      {
        key: String(data.orderId),
        headers: {
          eventType,
          eventVersion: String(EVENT_VERSION),
          producer: "payment-service",
        },
        value: JSON.stringify({
          eventId: buildEventId(),
          eventType,
          eventVersion: EVENT_VERSION,
          occurredAt: new Date().toISOString(),
          producer: "payment-service",
          data,
          event: eventType,
        }),
      },
    ],
  });
};

const publishPaymentCreated = async (payment) =>
  publishPaymentEvent(PAYMENT_CREATED_EVENT, payment);

const publishPaymentSucceeded = async (payment, extra = {}) =>
  publishPaymentEvent(PAYMENT_SUCCEEDED_EVENT, payment, extra);

const publishPaymentFailed = async (payment, extra = {}) =>
  publishPaymentEvent(PAYMENT_FAILED_EVENT, payment, extra);

module.exports = {
  PAYMENT_EVENTS_TOPIC,
  PAYMENT_CREATED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
  PAYMENT_FAILED_EVENT,
  publishPaymentCreated,
  publishPaymentSucceeded,
  publishPaymentFailed,
};
