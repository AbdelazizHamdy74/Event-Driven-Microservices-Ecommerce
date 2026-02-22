const express = require("express");
const router = express.Router();
const controller = require("../controllers/search.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/roles.middleware");

router.put(
  "/products/:productId",
  requireAuth,
  allowRoles("admin", "supplier"),
  controller.upsertProductInternal,
);

router.delete(
  "/products/:productId",
  requireAuth,
  allowRoles("admin", "supplier"),
  controller.deleteProductInternal,
);

module.exports = router;
