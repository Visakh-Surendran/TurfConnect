const express = require("express");
const router = express.Router();
const { getBookingRevenueReport } = require("../controllers/reportController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Booking History & Revenue Report generation for Admin and Owners
router.get("/bookings", requireAuth, requireRole("owner", "admin"), getBookingRevenueReport);

module.exports = router;
