const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "payment-service",
  brokers: [process.env.KAFKA_BROKER],
});

const producer = kafka.producer();
const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || "payment-service-group",
});

let producerConnected = false;
let consumerConnected = false;

const connectProducer = async () => {
  if (producerConnected) return;
  await producer.connect();
  producerConnected = true;
};

const disconnectProducer = async () => {
  if (!producerConnected) return;
  await producer.disconnect();
  producerConnected = false;
};

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

module.exports = {
  producer,
  consumer,
  connectProducer,
  disconnectProducer,
  connectConsumer,
  disconnectConsumer,
};
