const express = require("express");
const router = express.Router();
const { createRequest, getMyRequests, respondToRequest } = require("../controllers/playerRequestController");
const { requireAuth } = require("../middleware/auth");

router.post("/", requireAuth, createRequest);
router.get("/mine", requireAuth, getMyRequests);
router.put("/:id/respond", requireAuth, respondToRequest);

module.exports = router;