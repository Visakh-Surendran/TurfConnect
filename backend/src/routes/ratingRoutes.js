const express = require("express");
const router = express.Router();
const { submitRating, getRatingsForUser, getRatingsForTurf } = require("../controllers/ratingController");
const { requireAuth } = require("../middleware/auth");

router.post("/", requireAuth, submitRating);
router.get("/user/:userId", getRatingsForUser);
router.get("/turf/:turfId", getRatingsForTurf);

module.exports = router;