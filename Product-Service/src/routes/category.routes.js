const express = require("express");
const router = express.Router();
const controller = require("../controllers/category.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/roles.middleware");

router.get("/", controller.listCategories);
router.post("/", requireAuth, allowRoles("admin"), controller.createCategory);

module.exports = router;
