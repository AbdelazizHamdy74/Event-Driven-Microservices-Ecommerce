const {
  createProduct,
  getProductById,
  getProductForCart,
  listProducts,
} = require("../services/product.service");

exports.listProducts = async (req, res) => {
  const categoryId = Number(req.query.categoryId);
  const products = await listProducts({
    categoryId:
      Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined,
    onlyActive: true,
  });

  res.json({ count: products.length, products });
};

exports.getProductById = async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  const product = await getProductById(productId, { onlyActive: true });
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  res.json(product);
};

exports.createProduct = async (req, res) => {
  const product = await createProduct(req.body, req.user);
  res.status(201).json(product);
};

exports.getProductForCart = async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  const product = await getProductForCart(productId);
  if (!product) {
    return res.status(404).json({ message: "Product unavailable" });
  }

  res.json(product);
};
