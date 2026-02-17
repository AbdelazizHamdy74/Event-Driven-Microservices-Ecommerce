const express = require("express");
const router = express.Router();
const controller = require("../controllers/product.controller");

router.get("/products/:id", controller.getProductForCart);

module.exports = router;
