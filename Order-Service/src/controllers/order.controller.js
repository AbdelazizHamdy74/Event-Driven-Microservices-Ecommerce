const {
  createOrderFromCartItem,
  listOrdersByUserId,
  getOrderSummaryById,
  getOrderForActor,
  cancelOrder,
  updateOrderStatusByAdmin,
} = require("../services/order.service");

exports.createMyOrder = async (req, res) => {
  const order = await createOrderFromCartItem({
    actor: req.user,
    authorization: req.headers.authorization,
    productId: req.body.productId,
    quantity: req.body.quantity,
  });

  res.status(201).json(order);
};

exports.getMyOrders = async (req, res) => {
  const orders = await listOrdersByUserId(Number(req.user.id));
  res.json({
    count: orders.length,
    orders,
  });
};

exports.getOrdersByUserId = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  if (Number(req.user.id) !== userId && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const orders = await listOrdersByUserId(userId);
  res.json({
    count: orders.length,
    orders,
  });
};

exports.getOrderById = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const order = await getOrderForActor({
    orderId,
    actor: req.user,
  });

  res.json(order);
};

exports.cancelOrderById = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const order = await cancelOrder({
    orderId,
    actor: req.user,
  });

  res.json(order);
};

exports.updateOrderStatusByAdmin = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const order = await updateOrderStatusByAdmin({
    orderId,
    actor: req.user,
    status: req.body.status,
  });

  res.json(order);
};

exports.getOrderExistsInternal = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const order = await getOrderSummaryById(orderId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.json({
    exists: true,
    order,
  });
};
