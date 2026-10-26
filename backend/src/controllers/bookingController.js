const { pool } = require("../config/db");

// POST /api/bookings — Player books a slot
// This is the core conflict-safe operation of the whole project.
async function createBooking(req, res) {
  const { slot_id } = req.body;
  const user_id = req.user.id;

  if (!slot_id) {
    return res.status(400).json({ error: "slot_id is required" });
  }

  // We need a single dedicated connection (not the shared pool) to run
  // a real transaction — BEGIN / COMMIT / ROLLBACK must happen on the
  // same client, not a random connection from the pool each time.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // SELECT ... FOR UPDATE locks this specific row until we COMMIT or ROLLBACK.
    // If two requests hit this at the same time, the second one waits here
    // until the first one finishes — that's what makes double-booking impossible.
    const slotResult = await client.query(
      "SELECT * FROM slots WHERE id = $1 FOR UPDATE",
      [slot_id]
    );

    if (slotResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Slot not found" });
    }

    const slot = slotResult.rows[0];

    if (slot.status !== "available") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `This slot is already ${slot.status}` });
    }

    // Mark the slot as booked
    await client.query("UPDATE slots SET status = 'booked' WHERE id = $1", [slot_id]);

    // Create the booking record
    const bookingResult = await client.query(
      `INSERT INTO bookings (slot_id, user_id, booking_type, status)
       VALUES ($1, $2, 'normal', 'confirmed')
       RETURNING *`,
      [slot_id, user_id]
    );

    await client.query("COMMIT");

    return res.status(201).json({ booking: bookingResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create booking error:", err.message);
    return res.status(500).json({ error: "Failed to create booking" });
  } finally {
    client.release(); // always return the connection to the pool
  }
}

// GET /api/bookings/mine — Player's own booking history
async function getMyBookings(req, res) {
  try {
    const result = await pool.query(
      `SELECT b.id AS booking_id, b.status AS booking_status, b.created_at, b.cancellation_reason, b.cancelled_at,
              s.date, s.start_time, s.end_time, s.sport_type,
              t.name AS turf_name, t.location,
              p.id AS payment_id, p.amount AS payment_amount, p.status AS payment_status,
              p.payment_method, p.transaction_ref AS payment_ref,
              p.refund_id, p.refund_status, p.refund_amount, p.refund_reason, p.refunded_at
       FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       JOIN turfs t ON s.turf_id = t.id
       LEFT JOIN payments p ON b.payment_id = p.id
       WHERE b.user_id = $1
       ORDER BY s.date DESC, s.start_time DESC`,
      [req.user.id]
    );
    return res.json({ bookings: result.rows });
  } catch (err) {
    console.error("Get my bookings error:", err.message);
    return res.status(500).json({ error: "Failed to fetch bookings" });
  }
}

// PUT /api/bookings/:id/cancel — Player cancels their own booking (with automatic refund)
async function cancelBooking(req, res) {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const bookingResult = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingResult.rows[0];

    if (booking.user_id !== req.user.id && req.user.role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "This is not your booking" });
    }

    if (booking.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Booking is already cancelled" });
    }

    let refundDetails = null;

    // Check payment if linked
    let payment = null;
    if (booking.payment_id) {
      const payRes = await client.query(
        "SELECT * FROM payments WHERE id = $1",
        [booking.payment_id]
      );
      if (payRes.rows.length > 0) {
        payment = payRes.rows[0];
      }
    }

    // Check if there is a completed payment to refund
    if (payment && payment.status === "completed") {
      const { executeRefundHelper } = require("./paymentController");
      const refundInfo = await executeRefundHelper({
        client,
        paymentId: payment.id,
        reason: "Cancelled by player",
        refundAmount: payment.amount,
      });

      refundDetails = {
        refund_id: refundInfo.refundId,
        amount: refundInfo.amount,
        status: refundInfo.status,
      };
    } else if (payment && payment.status === "pending") {
      // Pay at venue reservation cancelled before payment
      await client.query(
        "UPDATE payments SET status = 'cancelled', refund_reason = 'Cancelled by player before arrival' WHERE id = $1",
        [payment.id]
      );
    }

    await client.query(
      "UPDATE bookings SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW() WHERE id = $2",
      ["Cancelled by customer", id]
    );
    await client.query("UPDATE slots SET status = 'available' WHERE id = $1", [booking.slot_id]);

    await client.query("COMMIT");

    const message = refundDetails
      ? `Booking cancelled successfully! A full refund of ₹${refundDetails.amount} has been initiated to your original payment method (Refund ID: ${refundDetails.refund_id}).`
      : "Booking cancelled successfully.";

    return res.json({
      success: true,
      message,
      refund: refundDetails,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Cancel booking error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to cancel booking" });
  } finally {
    client.release();
  }
}

module.exports = { createBooking, getMyBookings, cancelBooking };