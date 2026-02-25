const express = require("express");
const router = express.Router();
const controller = require("../controllers/payment.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

router.post("/me/orders/:orderId/charge", requireAuth, controller.chargeMyOrder);
router.get("/me", requireAuth, controller.listMyPayments);
router.get("/:paymentId", requireAuth, controller.getPaymentById);

module.exports = router;
