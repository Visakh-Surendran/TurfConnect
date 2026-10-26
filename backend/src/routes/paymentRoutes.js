const express = require("express");
const router = express.Router();
const {
  getPaymentConfig,
  createOrder,
  verifyPayment,
  payAtVenue,
  getOwnerPayments,
  markPaymentCollected,
  getMyPayments,
  refundPayment,
} = require("../controllers/paymentController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/config", requireAuth, getPaymentConfig);
router.post("/create-order", requireAuth, createOrder);
router.post("/verify", requireAuth, verifyPayment);
router.post("/pay-at-venue", requireAuth, payAtVenue);
router.get("/history", requireAuth, getMyPayments);
router.get("/owner", requireAuth, requireRole("owner", "admin"), getOwnerPayments);
router.put("/:id/collect", requireAuth, requireRole("owner", "admin"), markPaymentCollected);
router.post("/:id/refund", requireAuth, requireRole("owner", "admin"), refundPayment);

module.exports = router;

