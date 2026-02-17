const { consumer } = require("../config/kafka");
const { upsertOrderUserProjection } = require("../services/orderProjection.service");

const USER_EVENTS_TOPIC = process.env.KAFKA_USER_EVENTS_TOPIC || "user-events";
const USER_CREATED_EVENT = "USER_CREATED";

const parseUserCreatedEvent = (message) => {
  if (!message.value) return null;

  let parsedValue;
  try {
    parsedValue = JSON.parse(message.value.toString());
  } catch (err) {
    console.error("[order-service] invalid JSON event", err);
    return null;
  }

  const eventType = parsedValue.eventType || parsedValue.event;
  if (eventType !== USER_CREATED_EVENT) {
    return null;
  }

  const data = parsedValue.data || parsedValue.payload || {};
  const userId = Number(data.userId || data.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error("[order-service] invalid userId in USER_CREATED event", data);
    return null;
  }

  return {
    userId,
    name: data.name,
    email: data.email,
    role: data.role,
    accountStatus: data.accountStatus,
  };
};

const startUserEventsConsumer = async () => {
  await consumer.subscribe({
    topic: USER_EVENTS_TOPIC,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const userPayload = parseUserCreatedEvent(message);
      if (!userPayload) return;

      await upsertOrderUserProjection(userPayload);

      console.log(
        `[order-service] USER_CREATED handled userId=${userPayload.userId} topic=${topic} partition=${partition} offset=${message.offset}`,
      );
    },
  });
};

module.exports = { startUserEventsConsumer };
