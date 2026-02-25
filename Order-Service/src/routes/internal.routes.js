const express = require("express");
const router = express.Router();
const controller = require("../controllers/order.controller");

router.get("/orders/:orderId/exists", controller.getOrderExistsInternal);
router.post("/orders/:orderId/mark-paid", controller.markOrderPaidInternal);

module.exports = router;
