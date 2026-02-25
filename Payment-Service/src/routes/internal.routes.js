const express = require("express");
const router = express.Router();
const controller = require("../controllers/payment.controller");

router.get("/orders/:orderId/payments", controller.getPaymentsByOrderIdInternal);

module.exports = router;
