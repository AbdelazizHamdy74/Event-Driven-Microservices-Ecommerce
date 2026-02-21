const express = require("express");
const router = express.Router();
const controller = require("../controllers/inventory.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/roles.middleware");

router.get("/:productId", controller.getStockByProductId);
router.put(
  "/:productId/stock",
  requireAuth,
  allowRoles("admin", "supplier"),
  controller.upsertStockByProductId,
);

module.exports = router;
