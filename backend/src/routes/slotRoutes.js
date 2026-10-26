const express = require("express");
const router = express.Router();
const { blockSlot } = require("../controllers/slotController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.put("/:id/block", requireAuth, requireRole("owner", "admin"), blockSlot);

module.exports = router;    