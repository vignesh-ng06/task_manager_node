const express = require("express");

const router = express.Router();

const { getHealth } = require("../controllers/health.contoller");

router.get("/health", getHealth);


module.exports = router;