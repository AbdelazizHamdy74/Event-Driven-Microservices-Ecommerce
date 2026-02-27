const express = require("express");
const router = express.Router();
const controller = require("../controllers/notification.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

router.get("/me", requireAuth, controller.listMyNotifications);
router.patch(
  "/me/:notificationId/read",
  requireAuth,
  controller.markMyNotificationRead,
);
router.get("/user/:userId", requireAuth, controller.listNotificationsByUserId);

module.exports = router;
