const express = require("express");
const router = express.Router();
const { createBooking, getMyBookings, cancelBooking } = require("../controllers/bookingController");
const { requireAuth } = require("../middleware/auth");

router.post("/", requireAuth, createBooking);
router.get("/mine", requireAuth, getMyBookings);
router.put("/:id/cancel", requireAuth, cancelBooking);

module.exports = router;