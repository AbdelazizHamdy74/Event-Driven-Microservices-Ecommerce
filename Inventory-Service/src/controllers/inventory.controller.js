const {
  getInventoryByProductId,
  upsertStockByProductId,
  reserveStock,
  releaseReservationById,
  releaseReservationsByOrderId,
  confirmReservationsByOrderId,
  releaseExpiredReservations,
} = require("../services/inventory.service");

const toPositiveInt = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};

exports.getStockByProductId = async (req, res) => {
  const productId = toPositiveInt(req.params.productId);
  if (!productId) {
    return res.status(400).json({ message: "Invalid productId" });
  }

  const item = await getInventoryByProductId(productId);
  if (!item) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  res.json(item);
};

exports.upsertStockByProductId = async (req, res) => {
  const productId = toPositiveInt(req.params.productId);
  if (!productId) {
    return res.status(400).json({ message: "Invalid productId" });
  }

  const item = await upsertStockByProductId({
    productId,
    totalQuantity: req.body.totalQuantity,
  });

  res.json(item);
};

exports.reserveStockInternal = async (req, res) => {
  const result = await reserveStock({
    orderId: req.body.orderId,
    productId: req.body.productId,
    quantity: req.body.quantity,
    expiresAt: req.body.expiresAt,
  });

  res.status(201).json(result);
};

exports.releaseReservationInternal = async (req, res) => {
  const reservationId = toPositiveInt(req.params.reservationId);
  if (!reservationId) {
    return res.status(400).json({ message: "Invalid reservationId" });
  }

  const result = await releaseReservationById({
    reservationId,
    reason: req.body.reason,
  });

  res.json(result);
};

exports.releaseOrderReservationsInternal = async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const result = await releaseReservationsByOrderId({
    orderId,
    reason: req.body.reason,
  });

  res.json(result);
};

exports.confirmOrderReservationsInternal = async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const result = await confirmReservationsByOrderId({ orderId });
  res.json(result);
};

exports.releaseExpiredReservationsInternal = async (_req, res) => {
  const result = await releaseExpiredReservations();
  res.json(result);
};
