const express = require("express");
const router = express.Router();
const controller = require("../controllers/audit.controller");
const {
  requireInternalToken,
} = require("../middlewares/internalToken.middleware");

router.post(
  "/audit-logs",
  requireInternalToken,
  controller.ingestActivityLogInternal,
);

module.exports = router;
