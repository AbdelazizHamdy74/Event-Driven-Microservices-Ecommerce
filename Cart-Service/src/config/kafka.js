const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "cart-service",
  brokers: [process.env.KAFKA_BROKER],
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || "cart-service-group",
});

let consumerConnected = false;

const connectConsumer = async () => {
  if (consumerConnected) return;
  await consumer.connect();
  consumerConnected = true;
};

const disconnectConsumer = async () => {
  if (!consumerConnected) return;
  await consumer.disconnect();
  consumerConnected = false;
};

module.exports = { consumer, connectConsumer, disconnectConsumer };
