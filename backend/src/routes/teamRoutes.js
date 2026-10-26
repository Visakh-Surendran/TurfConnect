const express = require("express");
const router = express.Router();
const { createTeam, getMyTeams, getTeamById, addPlayerToTeam } = require("../controllers/teamController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.post("/", requireAuth, requireRole("player"), createTeam);
router.get("/mine", requireAuth, getMyTeams);
router.get("/:id", getTeamById);
router.post("/:id/players", requireAuth, requireRole("player"), addPlayerToTeam);

module.exports = router;            