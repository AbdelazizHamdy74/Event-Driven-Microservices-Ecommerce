const {
  searchProducts,
  upsertProductDocument,
  deleteProductDocument,
} = require("../services/search.service");

const toPositiveInt = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};

exports.searchProducts = async (req, res) => {
  const result = await searchProducts({
    query: req.query.q || req.query.query,
    categoryId: req.query.categoryId,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    inStock: req.query.inStock,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });

  res.json(result);
};

exports.upsertProductInternal = async (req, res) => {
  const productId = toPositiveInt(req.params.productId);
  if (!productId) {
    return res.status(400).json({ message: "Invalid productId" });
  }

  const document = await upsertProductDocument({
    ...req.body,
    productId,
  });

  res.json(document);
};

exports.deleteProductInternal = async (req, res) => {
  const productId = toPositiveInt(req.params.productId);
  if (!productId) {
    return res.status(400).json({ message: "Invalid productId" });
  }

  const removed = await deleteProductDocument(productId);
  if (!removed) {
    return res.status(404).json({ message: "Document not found" });
  }

  res.json({
    deleted: true,
    productId,
  });
};
