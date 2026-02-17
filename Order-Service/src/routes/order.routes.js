const express = require("express");
const router = express.Router();
const controller = require("../controllers/order.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

router.post("/me", requireAuth, controller.createMyOrder);
router.get("/me", requireAuth, controller.getMyOrders);
router.get("/user/:userId", requireAuth, controller.getOrdersByUserId);
router.patch("/:orderId/status", requireAuth, controller.updateOrderStatusByAdmin);
router.get("/:orderId", requireAuth, controller.getOrderById);
router.patch("/:orderId/cancel", requireAuth, controller.cancelOrderById);

module.exports = router;
