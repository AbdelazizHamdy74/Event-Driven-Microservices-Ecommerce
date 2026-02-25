const {
  createPaymentForOrder,
  listPaymentsByUserId,
  getPaymentForActor,
  listPaymentsByOrderId,
} = require("../services/payment.service");

const toPositiveInt = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};

exports.chargeMyOrder = async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const result = await createPaymentForOrder({
    actor: req.user,
    orderId,
    provider: req.body.provider,
    paymentMethod: req.body.paymentMethod,
    paymentToken: req.body.paymentToken,
    metadata: req.body.metadata,
  });

  const responseStatus =
    result.payment.status === "failed"
      ? 200
      : result.orderSync.ok
        ? 201
        : 202;

  res.status(responseStatus).json(result);
};

exports.listMyPayments = async (req, res) => {
  const payments = await listPaymentsByUserId(Number(req.user.id));
  res.json({
    count: payments.length,
    payments,
  });
};

exports.getPaymentById = async (req, res) => {
  const paymentId = toPositiveInt(req.params.paymentId);
  if (!paymentId) {
    return res.status(400).json({ message: "Invalid paymentId" });
  }

  const payment = await getPaymentForActor({
    paymentId,
    actor: req.user,
  });

  res.json(payment);
};

exports.getPaymentsByOrderIdInternal = async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const payments = await listPaymentsByOrderId(orderId);
  res.json({
    orderId,
    count: payments.length,
    payments,
  });
};
