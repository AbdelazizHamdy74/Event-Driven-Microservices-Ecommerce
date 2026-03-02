const express = require("express");
const router = express.Router();
const controller = require("../controllers/audit.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/roles.middleware");

router.get("/logs", requireAuth, allowRoles("admin"), controller.listLogs);
router.get("/logs/me", requireAuth, controller.listMyLogs);

module.exports = router;
