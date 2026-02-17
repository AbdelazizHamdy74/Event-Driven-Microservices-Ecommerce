const { addProductToCart, getCartByUserId } = require("../services/cart.service");

exports.getMyCart = async (req, res) => {
  const cart = await getCartByUserId(Number(req.user.id));
  if (!cart) {
    return res.status(404).json({ message: "Cart not found" });
  }

  res.json(cart);
};

exports.addMyCartItem = async (req, res) => {
  if (req.user.role !== "user") {
    return res.status(403).json({ message: "Only users can add to cart" });
  }

  const cart = await addProductToCart({
    userId: Number(req.user.id),
    productId: req.body.productId,
    quantity: req.body.quantity ?? 1,
  });

  res.status(201).json(cart);
};

exports.getCartByUserId = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  if (Number(req.user.id) !== userId && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const cart = await getCartByUserId(userId);
  if (!cart) {
    return res.status(404).json({ message: "Cart not found" });
  }

  res.json(cart);
};
