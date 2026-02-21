const express = require("express");
const router = express.Router();
const controller = require("../controllers/inventory.controller");

router.post("/reservations", controller.reserveStockInternal);
router.post(
  "/reservations/release-expired",
  controller.releaseExpiredReservationsInternal,
);
router.post(
  "/reservations/:reservationId/release",
  controller.releaseReservationInternal,
);
router.post("/orders/:orderId/release", controller.releaseOrderReservationsInternal);
router.post("/orders/:orderId/confirm", controller.confirmOrderReservationsInternal);

module.exports = router;
