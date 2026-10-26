const express = require("express");
const router = express.Router();
const {
  createTurf, getAllTurfs, getTurfById, updateTurf,
  getMyTurfs, getPendingTurfs, updateTurfStatus,
} = require("../controllers/turfController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateSlots, getSlotsByTurf } = require("../controllers/slotController");
const { addTurfSport, getTurfSports, updateTurfSport } = require("../controllers/turfSportController");


// Public — only approved turfs are searchable
router.get("/", getAllTurfs);

router.post("/:turfId/sports", requireAuth, requireRole("owner", "admin"), addTurfSport);
router.get("/:turfId/sports", getTurfSports);
router.put("/:turfId/sports/:sportId", requireAuth, requireRole("owner", "admin"), updateTurfSport);

router.post("/:turfId/slots/generate", requireAuth, requireRole("owner", "admin"), generateSlots);
router.get("/:turfId/slots", getSlotsByTurf);

// Owner — must come before /:id so "mine" isn't treated as an id
router.get("/mine", requireAuth, requireRole("owner", "admin"), getMyTurfs);

// Admin — moderation queue
router.get("/pending", requireAuth, requireRole("admin"), getPendingTurfs);
router.put("/:id/status", requireAuth, requireRole("admin"), updateTurfStatus);

// Public detail view, and owner-protected create/update
router.get("/:id", getTurfById);
router.post("/", requireAuth, requireRole("owner", "admin"), createTurf);
router.put("/:id", requireAuth, requireRole("owner", "admin"), updateTurf);

module.exports = router;