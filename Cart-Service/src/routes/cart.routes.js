const express = require("express");
const router = express.Router();
const controller = require("../controllers/cart.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

router.get("/me", requireAuth, controller.getMyCart);
router.post("/me/items", requireAuth, controller.addMyCartItem);
router.get("/:userId", requireAuth, controller.getCartByUserId);

module.exports = router;
