const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "user-service",
  brokers: [process.env.KAFKA_BROKER],
});

const producer = kafka.producer();
let producerConnected = false;

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

module.exports = { producer, connectProducer, disconnectProducer };
