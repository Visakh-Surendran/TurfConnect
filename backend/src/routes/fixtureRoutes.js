const express = require("express");
const router = express.Router();
const { submitResult } = require("../controllers/matchController");
const { requireAuth } = require("../middleware/auth");

router.put("/:id/result", requireAuth, submitResult);

module.exports = router;