const express = require("express");
const router = express.Router();
const { upsertProfile, getMyProfile, searchPlayers, updateAvailability } = require("../controllers/playerController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", searchPlayers);
router.get("/me", requireAuth, requireRole("player"), getMyProfile);
router.post("/", requireAuth, requireRole("player"), upsertProfile);
router.put("/availability", requireAuth, requireRole("player"), updateAvailability);

module.exports = router;