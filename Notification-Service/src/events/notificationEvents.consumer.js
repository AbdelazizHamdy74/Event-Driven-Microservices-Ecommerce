const { consumer } = require("../config/kafka");
const {
  USER_EVENTS_TOPIC,
  handleUserEventMessage,
} = require("./userEvents.consumer");
const {
  PAYMENT_EVENTS_TOPIC,
  handlePaymentEventMessage,
} = require("./paymentEvents.consumer");

const startNotificationEventsConsumer = async () => {
  const topics = [USER_EVENTS_TOPIC];
  if (PAYMENT_EVENTS_TOPIC !== USER_EVENTS_TOPIC) {
    topics.push(PAYMENT_EVENTS_TOPIC);
  }

  for (const topic of topics) {
    await consumer.subscribe({
      topic,
      fromBeginning: false,
    });
  }

  await consumer.run({
    eachMessage: async (payload) => {
      if (payload.topic === USER_EVENTS_TOPIC) {
        await handleUserEventMessage(payload);
        return;
      }

      if (payload.topic === PAYMENT_EVENTS_TOPIC) {
        await handlePaymentEventMessage(payload);
      }
    },
  });
};

module.exports = { startNotificationEventsConsumer };
