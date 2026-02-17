const {
  createCategory,
  listCategories,
} = require("../services/category.service");

exports.listCategories = async (_req, res) => {
  const categories = await listCategories({ onlyActive: true });
  res.json({ count: categories.length, categories });
};

exports.createCategory = async (req, res) => {
  const category = await createCategory(req.body, Number(req.user.id));
  res.status(201).json(category);
};
