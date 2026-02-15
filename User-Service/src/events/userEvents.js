const crypto = require("crypto");
const { producer } = require("../config/kafka");

const USER_EVENTS_TOPIC = process.env.KAFKA_USER_EVENTS_TOPIC || "user-events";
const USER_CREATED_EVENT = "USER_CREATED";
const EVENT_VERSION = 1;

const buildEventId = () => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
};

const publishUserCreated = async (user) => {
  const payload = {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role || "user",
    accountStatus: user.accountStatus || "active",
  };

  await producer.send({
    topic: USER_EVENTS_TOPIC,
    messages: [
      {
        key: String(payload.id),
        headers: {
          eventType: USER_CREATED_EVENT,
          eventVersion: String(EVENT_VERSION),
          producer: "user-service",
        },
        value: JSON.stringify({
          eventId: buildEventId(),
          eventType: USER_CREATED_EVENT,
          eventVersion: EVENT_VERSION,
          occurredAt: new Date().toISOString(),
          producer: "user-service",
          data: payload,
          event: USER_CREATED_EVENT,
        }),
      },
    ],
  });
};

module.exports = {
  USER_CREATED_EVENT,
  USER_EVENTS_TOPIC,
  publishUserCreated,
};
