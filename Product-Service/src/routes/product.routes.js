const express = require("express");
const router = express.Router();
const controller = require("../controllers/product.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/roles.middleware");

router.get("/", controller.listProducts);
router.get("/:id", controller.getProductById);
router.post(
  "/",
  requireAuth,
  allowRoles("admin", "supplier"),
  controller.createProduct,
);

module.exports = router;
