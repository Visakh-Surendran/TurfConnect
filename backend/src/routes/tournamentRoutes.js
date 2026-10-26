const express = require("express");
const router = express.Router();
const {
  createTournament, getAllTournaments, getTournamentById, registerTeam, getRegisteredTeams,
} = require("../controllers/tournamentController");
const { generateFixtures, advanceKnockoutRound, getFixtures } = require("../controllers/fixtureController");
const { getStandings } = require("../controllers/matchController");
const { requireAuth } = require("../middleware/auth");

router.get("/", getAllTournaments);
router.post("/", requireAuth, createTournament);
router.get("/:id", getTournamentById);
router.post("/:id/register", requireAuth, registerTeam);
router.get("/:id/teams", getRegisteredTeams);
router.post("/:id/fixtures/generate", requireAuth, generateFixtures);
router.post("/:id/fixtures/next-round", requireAuth, advanceKnockoutRound);
router.get("/:id/fixtures", getFixtures);
router.get("/:id/standings", getStandings);

module.exports = router;