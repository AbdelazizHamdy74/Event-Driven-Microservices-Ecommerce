const { consumer } = require("../config/kafka");
const { createDomainEventLog } = require("../services/audit.service");

const USER_EVENTS_TOPIC = process.env.KAFKA_USER_EVENTS_TOPIC || "user-events";
const PAYMENT_EVENTS_TOPIC =
  process.env.KAFKA_PAYMENT_EVENTS_TOPIC || "payment-events";
const EXTRA_TOPICS = (process.env.KAFKA_AUDIT_EXTRA_TOPICS || "")
  .split(",")
  .map((topic) => topic.trim())
  .filter(Boolean);

const DOMAIN_EVENT_TOPICS = [
  ...new Set([USER_EVENTS_TOPIC, PAYMENT_EVENTS_TOPIC, ...EXTRA_TOPICS]),
];

const toHeaderText = (value) => {
  if (Buffer.isBuffer(value)) return value.toString().trim();
  if (Array.isArray(value) && value.length) {
    return toHeaderText(value[0]);
  }
  if (typeof value === "string") return value.trim();
  return null;
};

const parseEventMessage = (message) => {
  if (!message.value) return null;

  try {
    return JSON.parse(message.value.toString());
  } catch (_error) {
    return null;
  }
};

const inferActorUserId = (data) => {
  if (!data || typeof data !== "object") return null;

  const candidates = [data.actorUserId, data.userId, data.id, data.customerId];
  for (const candidate of candidates) {
    const normalized = Number(candidate);
    if (Number.isInteger(normalized) && normalized > 0) {
      return normalized;
    }
  }

  return null;
};

const toNullablePositiveInt = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const toNullableEventVersion = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const inferSeverity = (eventType) => {
  if (typeof eventType !== "string" || !eventType.trim()) return "info";
  const normalized = eventType.trim().toUpperCase();
  if (normalized.includes("FAILED") || normalized.includes("ERROR")) {
    return "critical";
  }
  if (
    normalized.includes("CANCEL") ||
    normalized.includes("BLOCK") ||
    normalized.includes("DENIED")
  ) {
    return "warning";
  }

  return "info";
};

const handleDomainEventMessage = async ({ topic, partition, message }) => {
  const parsedEvent = parseEventMessage(message);
  if (!parsedEvent) return;

  const headers = message.headers || {};
  const eventType =
    (typeof parsedEvent.eventType === "string" && parsedEvent.eventType.trim()) ||
    (typeof parsedEvent.event === "string" && parsedEvent.event.trim()) ||
    toHeaderText(headers.eventType) ||
    "UNKNOWN_EVENT";
  const producer =
    (typeof parsedEvent.producer === "string" && parsedEvent.producer.trim()) ||
    toHeaderText(headers.producer) ||
    `kafka:${topic}`;
  const eventId =
    (typeof parsedEvent.eventId === "string" && parsedEvent.eventId.trim()) ||
    toHeaderText(headers.eventId) ||
    null;
  const eventVersion =
    toNullableEventVersion(parsedEvent.eventVersion) ||
    toNullableEventVersion(toHeaderText(headers.eventVersion));

  const data =
    parsedEvent.data && typeof parsedEvent.data === "object"
      ? parsedEvent.data
      : parsedEvent.payload && typeof parsedEvent.payload === "object"
        ? parsedEvent.payload
        : null;
  const actorUserId = inferActorUserId(data);

  await createDomainEventLog({
    serviceName: producer,
    action: eventType,
    actorUserId,
    actorRole: actorUserId ? "user" : "system",
    severity: inferSeverity(eventType),
    sourceTopic: topic,
    sourcePartition: partition,
    sourceOffset: message.offset,
    sourceEventId: eventId,
    sourceEventType: eventType,
    sourceEventVersion: eventVersion,
    occurredAt: parsedEvent.occurredAt,
    metadata: {
      key: message.key ? message.key.toString() : null,
      headers: {
        producer: toHeaderText(headers.producer),
        eventType: toHeaderText(headers.eventType),
        eventVersion: toHeaderText(headers.eventVersion),
      },
    },
    payload: data || parsedEvent,
  });

  console.log(
    `[audit-service] domain event logged type=${eventType} topic=${topic} partition=${partition} offset=${message.offset}`,
  );
};

const startDomainEventsConsumer = async () => {
  for (const topic of DOMAIN_EVENT_TOPICS) {
    await consumer.subscribe({
      topic,
      fromBeginning: false,
    });
  }

  await consumer.run({
    eachMessage: async (payload) => {
      await handleDomainEventMessage(payload);
    },
  });
};

module.exports = {
  DOMAIN_EVENT_TOPICS,
  startDomainEventsConsumer,
};
