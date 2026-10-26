const crypto = require("crypto");
const { pool } = require("../config/db");
const { razorpay, isRazorpayConfigured } = require("../config/razorpay");

// Helper to process a refund through Razorpay (or fallback mock) and update payments table
async function executeRefundHelper({ client, paymentId, reason, refundAmount }) {
  const db = client || pool;
  const res = await db.query("SELECT * FROM payments WHERE id = $1 FOR UPDATE", [paymentId]);
  if (res.rows.length === 0) throw new Error("Payment record not found");
  const payment = res.rows[0];

  if (payment.status === "refunded") {
    return {
      alreadyRefunded: true,
      refundId: payment.refund_id,
      amount: payment.refund_amount || payment.amount,
      status: payment.refund_status || "processed",
      payment,
    };
  }

  const amt = refundAmount !== undefined ? Number(refundAmount) : Number(payment.amount);
  let refundId = null;
  let refundStatus = "processed";

  if (payment.payment_method === "online") {
    if (
      isRazorpayConfigured() &&
      payment.razorpay_payment_id &&
      !payment.razorpay_payment_id.startsWith("pay_mock_")
    ) {
      try {
        const rzpRefund = await razorpay.payments.refund(payment.razorpay_payment_id, {
          amount: Math.round(amt * 100),
          notes: {
            reason: reason || "Refund initiated",
            payment_id: String(paymentId),
          },
        });
        refundId = rzpRefund.id;
      } catch (err) {
        console.error("Razorpay refund API error:", err);
        refundId = `rfnd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
    } else {
      refundId = `rfnd_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
  } else {
    refundId = `rfnd_cash_${Date.now()}`;
  }

  const updateRes = await db.query(
    `UPDATE payments
     SET status = 'refunded',
         refund_id = $1,
         refund_status = $2,
         refund_amount = $3,
         refund_reason = $4,
         refunded_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [refundId, refundStatus, amt, reason || "Booking cancelled / refunded", paymentId]
  );

  return {
    success: true,
    payment: updateRes.rows[0],
    refundId,
    amount: amt,
    status: refundStatus,
  };
}

// GET /api/payments/config — Return public configuration (Key ID & config status)
async function getPaymentConfig(req, res) {
  return res.json({
    keyId: process.env.RAZORPAY_KEY_ID || "",
    isConfigured: isRazorpayConfigured(),
  });
}

// POST /api/payments/create-order — Create Razorpay order for slot booking or tournament
async function createOrder(req, res) {
  const { slot_id, tournament_id, team_id, purpose = "slot_booking", sport_type } = req.body;
  const user_id = req.user.id;

  try {
    // 1. Slot Booking Order
    if (purpose === "slot_booking" || slot_id) {
      if (!slot_id) {
        return res.status(400).json({ error: "slot_id is required for slot booking" });
      }

      const slotResult = await pool.query(
        `SELECT s.*, t.name AS turf_name, t.location
         FROM slots s
         JOIN turfs t ON s.turf_id = t.id
         WHERE s.id = $1`,
        [slot_id]
      );

      if (slotResult.rows.length === 0) {
        return res.status(404).json({ error: "Slot not found" });
      }

      const slot = slotResult.rows[0];

      if (slot.status !== "available") {
        return res.status(409).json({ error: `This slot is already ${slot.status}` });
      }

      let amount = Number(slot.price);
      let selectedSport = slot.sport_type;

      if (sport_type) {
        const sportPriceRes = await pool.query(
          "SELECT price_per_hour, peak_price, TRIM(sport_type) AS sport_type FROM turf_sports WHERE turf_id = $1 AND LOWER(TRIM(sport_type)) = LOWER(TRIM($2))",
          [slot.turf_id, sport_type]
        );
        if (sportPriceRes.rows.length > 0) {
          const sp = sportPriceRes.rows[0];
          selectedSport = sp.sport_type;
          const startHour = parseInt(String(slot.start_time).slice(0, 2), 10);
          amount = startHour >= 18 && sp.peak_price ? Number(sp.peak_price) : Number(sp.price_per_hour);
          await pool.query(
            "UPDATE slots SET sport_type = $1, price = $2 WHERE id = $3",
            [selectedSport, amount, slot.id]
          );
        }
      }

      if (isNaN(amount) || amount <= 0) {
        amount = 800; // fallback standard rate
      }

      const amountInPaise = Math.round(amount * 100);

      // If Razorpay is configured with valid dashboard keys
      if (isRazorpayConfigured()) {
        const options = {
          amount: amountInPaise,
          currency: "INR",
          receipt: `rcpt_slot_${slot.id}_${Date.now()}`.slice(0, 40),
          notes: {
            slot_id: String(slot.id),
            turf_id: String(slot.turf_id),
            user_id: String(user_id),
            purpose: "slot_booking",
          },
        };

        const order = await razorpay.orders.create(options);

        // Record initial payment attempt in database
        const paymentResult = await pool.query(
          `INSERT INTO payments (user_id, amount, status, transaction_ref, razorpay_order_id, purpose)
           VALUES ($1, $2, 'created', $3, $3, 'slot_booking')
           RETURNING id`,
          [user_id, amount, order.id]
        );

        return res.status(201).json({
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
          paymentId: paymentResult.rows[0].id,
          isMock: false,
          slot: {
            id: slot.id,
            turf_name: slot.turf_name,
            location: slot.location,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            sport_type: slot.sport_type,
            price: slot.price,
          },
        });
      } else {
        // Fallback mock mode when developer hasn't configured Razorpay keys yet
        const mockOrderId = `order_mock_${Date.now()}`;
        const paymentResult = await pool.query(
          `INSERT INTO payments (user_id, amount, status, transaction_ref, razorpay_order_id, purpose)
           VALUES ($1, $2, 'created', $3, $3, 'slot_booking')
           RETURNING id`,
          [user_id, amount, mockOrderId]
        );

        return res.status(201).json({
          orderId: mockOrderId,
          amount: amountInPaise,
          currency: "INR",
          keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
          paymentId: paymentResult.rows[0].id,
          isMock: true,
          message:
            "Running in test mock mode. To use real Razorpay popup, add valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env",
          slot: {
            id: slot.id,
            turf_name: slot.turf_name,
            location: slot.location,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            sport_type: slot.sport_type,
            price: slot.price,
          },
        });
      }
    }

    // 2. Tournament Entry Fee Order
    if (purpose === "tournament_entry" || tournament_id) {
      if (!tournament_id || !team_id) {
        return res.status(400).json({ error: "tournament_id and team_id are required" });
      }

      const teamCheck = await pool.query("SELECT captain_id FROM teams WHERE id = $1", [team_id]);
      if (teamCheck.rows.length === 0) return res.status(404).json({ error: "Team not found" });
      if (teamCheck.rows[0].captain_id !== user_id) {
        return res.status(403).json({ error: "Only the team captain can register this team" });
      }

      const tourneyResult = await pool.query("SELECT * FROM tournaments WHERE id = $1", [tournament_id]);
      if (tourneyResult.rows.length === 0) return res.status(404).json({ error: "Tournament not found" });

      const tourney = tourneyResult.rows[0];
      const entryFee = Number(tourney.entry_fee || 0);

      if (entryFee <= 0) {
        return res.status(400).json({ error: "This tournament has no entry fee. Use direct registration." });
      }

      const amountInPaise = Math.round(entryFee * 100);

      if (isRazorpayConfigured()) {
        const options = {
          amount: amountInPaise,
          currency: "INR",
          receipt: `rcpt_tourney_${tournament_id}_${team_id}_${Date.now()}`.slice(0, 40),
          notes: {
            tournament_id: String(tournament_id),
            team_id: String(team_id),
            user_id: String(user_id),
            purpose: "tournament_entry",
          },
        };

        const order = await razorpay.orders.create(options);

        const paymentResult = await pool.query(
          `INSERT INTO payments (user_id, amount, status, transaction_ref, razorpay_order_id, purpose)
           VALUES ($1, $2, 'created', $3, $3, 'tournament_entry')
           RETURNING id`,
          [user_id, entryFee, order.id]
        );

        return res.status(201).json({
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
          paymentId: paymentResult.rows[0].id,
          isMock: false,
          tournament: tourney,
        });
      } else {
        const mockOrderId = `order_mock_${Date.now()}`;
        const paymentResult = await pool.query(
          `INSERT INTO payments (user_id, amount, status, transaction_ref, razorpay_order_id, purpose)
           VALUES ($1, $2, 'created', $3, $3, 'tournament_entry')
           RETURNING id`,
          [user_id, entryFee, mockOrderId]
        );

        return res.status(201).json({
          orderId: mockOrderId,
          amount: amountInPaise,
          currency: "INR",
          keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
          paymentId: paymentResult.rows[0].id,
          isMock: true,
          tournament: tourney,
        });
      }
    }

    return res.status(400).json({ error: "Invalid payment purpose" });
  } catch (err) {
    console.error("Create payment order error:", err);
    return res.status(500).json({ error: err.message || "Failed to create payment order" });
  }
}

// POST /api/payments/verify — Verify Razorpay signature and finalize booking
async function verifyPayment(req, res) {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    slot_id,
    tournament_id,
    team_id,
    purpose = "slot_booking",
  } = req.body;

  const user_id = req.user.id;

  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: "Missing required payment parameters" });
  }

  // 1. Verify HMAC SHA-256 signature if in real Razorpay mode
  const isMockOrder = razorpay_order_id.startsWith("order_mock_");
  if (!isMockOrder && isRazorpayConfigured()) {
    if (!razorpay_signature) {
      return res.status(400).json({ error: "razorpay_signature is required" });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("Signature mismatch:", { expectedSignature, razorpay_signature });
      return res.status(400).json({ error: "Payment verification failed: Invalid signature" });
    }
  }

  // 2. Perform database transaction to finalize booking & payment
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Handling Slot Booking
    if (purpose === "slot_booking" || slot_id) {
      // Lock slot row to avoid race condition double bookings
      const slotResult = await client.query(
        "SELECT * FROM slots WHERE id = $1 FOR UPDATE",
        [slot_id]
      );

      if (slotResult.rows.length === 0) {
        // Slot not found - false booking conflict
        const newPayment = await client.query(
          `INSERT INTO payments (user_id, amount, status, payment_method, transaction_ref, razorpay_order_id, razorpay_payment_id, razorpay_signature, purpose)
           VALUES ($1, $2, 'created', 'online', $3, $4, $3, $5, 'slot_booking')
           RETURNING id`,
          [user_id, 800, razorpay_payment_id, razorpay_order_id, razorpay_signature || "mock_signature"]
        );
        const paymentRecordId = newPayment.rows[0].id;
        const refundInfo = await executeRefundHelper({
          client,
          paymentId: paymentRecordId,
          reason: "Automatic refund: Slot not found (false booking)",
          refundAmount: 800,
        });
        await client.query("COMMIT");
        return res.status(200).json({
          success: false,
          false_booking: true,
          refunded: true,
          error: "Selected slot was unavailable. An automatic full refund has been initiated to your account.",
          refund: {
            refund_id: refundInfo.refundId,
            amount: refundInfo.amount,
            status: refundInfo.status,
            reason: "Slot not found / false booking",
          },
        });
      }

      const slot = slotResult.rows[0];

      if (slot.status !== "available") {
        // FALSE BOOKING / RACE CONDITION CONFLICT!
        // Another player took the slot right before verification.
        const refundAmt = Number(slot.price) || 800;
        let paymentRecordId;
        const existingPayment = await client.query(
          "SELECT id FROM payments WHERE razorpay_order_id = $1 OR transaction_ref = $1 LIMIT 1",
          [razorpay_order_id]
        );

        if (existingPayment.rows.length > 0) {
          paymentRecordId = existingPayment.rows[0].id;
        } else {
          const newPayment = await client.query(
            `INSERT INTO payments (user_id, amount, status, payment_method, transaction_ref, razorpay_order_id, razorpay_payment_id, razorpay_signature, purpose)
             VALUES ($1, $2, 'created', 'online', $3, $4, $3, $5, 'slot_booking')
             RETURNING id`,
            [user_id, refundAmt, razorpay_payment_id, razorpay_order_id, razorpay_signature || "mock_signature"]
          );
          paymentRecordId = newPayment.rows[0].id;
        }

        const refundInfo = await executeRefundHelper({
          client,
          paymentId: paymentRecordId,
          reason: "Automatic refund: Slot conflict / False booking (slot already booked)",
          refundAmount: refundAmt,
        });

        await client.query("COMMIT");

        return res.status(200).json({
          success: false,
          false_booking: true,
          refunded: true,
          error: `Slot was already booked by another player while payment was processing. A full automatic refund of ₹${refundAmt} has been processed.`,
          refund: {
            refund_id: refundInfo.refundId,
            amount: refundInfo.amount,
            status: refundInfo.status,
            reason: "Slot conflict / false booking",
          },
        });
      }

      // Update or insert payment record as 'completed'
      let paymentRecordId;
      const existingPayment = await client.query(
        "SELECT id FROM payments WHERE razorpay_order_id = $1 OR transaction_ref = $1 LIMIT 1",
        [razorpay_order_id]
      );

      if (existingPayment.rows.length > 0) {
        paymentRecordId = existingPayment.rows[0].id;
        await client.query(
          `UPDATE payments
           SET status = 'completed',
               payment_method = 'online',
               transaction_ref = $1,
               razorpay_payment_id = $1,
               razorpay_signature = $2
           WHERE id = $3`,
          [razorpay_payment_id, razorpay_signature || "mock_signature", paymentRecordId]
        );
      } else {
        const newPayment = await client.query(
          `INSERT INTO payments (user_id, amount, status, payment_method, transaction_ref, razorpay_order_id, razorpay_payment_id, razorpay_signature, purpose)
           VALUES ($1, $2, 'completed', 'online', $3, $4, $3, $5, 'slot_booking')
           RETURNING id`,
          [user_id, slot.price, razorpay_payment_id, razorpay_order_id, razorpay_signature || "mock_signature"]
        );
        paymentRecordId = newPayment.rows[0].id;
      }

      // Update slot to 'booked'
      await client.query("UPDATE slots SET status = 'booked' WHERE id = $1", [slot_id]);

      // Create booking record with payment_id
      const bookingResult = await client.query(
        `INSERT INTO bookings (slot_id, user_id, booking_type, status, payment_id)
         VALUES ($1, $2, 'normal', 'confirmed', $3)
         RETURNING *`,
        [slot_id, user_id, paymentRecordId]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Payment verified and slot booked successfully!",
        booking: bookingResult.rows[0],
        payment_id: paymentRecordId,
        transaction_ref: razorpay_payment_id,
      });
    }

    // Handling Tournament Registration
    if (purpose === "tournament_entry" || tournament_id) {
      const tourneyResult = await client.query(
        "SELECT * FROM tournaments WHERE id = $1 FOR UPDATE",
        [tournament_id]
      );

      if (tourneyResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Tournament not found" });
      }

      const tourney = tourneyResult.rows[0];

      let paymentRecordId;
      const existingPayment = await client.query(
        "SELECT id FROM payments WHERE razorpay_order_id = $1 OR transaction_ref = $1 LIMIT 1",
        [razorpay_order_id]
      );

      if (existingPayment.rows.length > 0) {
        paymentRecordId = existingPayment.rows[0].id;
        await client.query(
          `UPDATE payments
           SET status = 'completed',
               payment_method = 'online',
               transaction_ref = $1,
               razorpay_payment_id = $1,
               razorpay_signature = $2
           WHERE id = $3`,
          [razorpay_payment_id, razorpay_signature || "mock_signature", paymentRecordId]
        );
      } else {
        const newPayment = await client.query(
          `INSERT INTO payments (user_id, amount, status, payment_method, transaction_ref, razorpay_order_id, razorpay_payment_id, razorpay_signature, purpose)
           VALUES ($1, $2, 'completed', 'online', $3, $4, $3, $5, 'tournament_entry')
           RETURNING id`,
          [user_id, tourney.entry_fee, razorpay_payment_id, razorpay_order_id, razorpay_signature || "mock_signature"]
        );
        paymentRecordId = newPayment.rows[0].id;
      }

      const countResult = await client.query(
        "SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = $1 AND status = 'registered'",
        [tournament_id]
      );
      const currentCount = parseInt(countResult.rows[0].count, 10);
      const regStatus = currentCount >= tourney.max_teams ? "waitlisted" : "registered";

      const regResult = await client.query(
        `INSERT INTO tournament_registrations (tournament_id, team_id, payment_id, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [tournament_id, team_id, paymentRecordId, regStatus]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Payment verified and tournament registered successfully!",
        registration: regResult.rows[0],
        payment_id: paymentRecordId,
        transaction_ref: razorpay_payment_id,
      });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ error: "Unknown payment purpose" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Payment verification transaction error:", err);
    return res.status(500).json({ error: err.message || "Payment verification failed" });
  } finally {
    client.release();
  }
}

// GET /api/payments/history — Return current user's payment history
async function getMyPayments(req, res) {
  try {
    const result = await pool.query(
      `SELECT p.*, b.id AS booking_id, s.date, s.start_time, s.end_time, t.name AS turf_name
       FROM payments p
       LEFT JOIN bookings b ON b.payment_id = p.id
       LEFT JOIN slots s ON b.slot_id = s.id
       LEFT JOIN turfs t ON s.turf_id = t.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return res.json({ payments: result.rows });
  } catch (err) {
    console.error("Get payments error:", err);
    return res.status(500).json({ error: "Failed to fetch payment history" });
  }
}

// POST /api/payments/pay-at-venue — Confirm booking/registration with "Pay at Turf / Cash on Arrival"
async function payAtVenue(req, res) {
  const { slot_id, tournament_id, team_id, purpose = "slot_booking", sport_type } = req.body;
  const user_id = req.user.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Slot Booking via Pay at Venue
    if (purpose === "slot_booking" || slot_id) {
      if (!slot_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "slot_id is required for slot booking" });
      }

      // Lock slot row to avoid race condition double bookings
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
        return res.status(409).json({
          error: `Slot is already ${slot.status}. Please choose another slot.`,
        });
      }

      let amount = Number(slot.price);
      let selectedSport = slot.sport_type;

      if (sport_type) {
        const sportPriceRes = await client.query(
          "SELECT price_per_hour, peak_price, TRIM(sport_type) AS sport_type FROM turf_sports WHERE turf_id = $1 AND LOWER(TRIM(sport_type)) = LOWER(TRIM($2))",
          [slot.turf_id, sport_type]
        );
        if (sportPriceRes.rows.length > 0) {
          const sp = sportPriceRes.rows[0];
          selectedSport = sp.sport_type;
          const startHour = parseInt(String(slot.start_time).slice(0, 2), 10);
          amount = startHour >= 18 && sp.peak_price ? Number(sp.peak_price) : Number(sp.price_per_hour);
          slot.price = amount;
          slot.sport_type = selectedSport;
          await client.query(
            "UPDATE slots SET sport_type = $1, price = $2 WHERE id = $3",
            [selectedSport, amount, slot.id]
          );
        }
      }

      const ref = `VEN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Insert payment record as 'pending' with payment_method 'pay_at_venue'
      const paymentResult = await client.query(
        `INSERT INTO payments (user_id, amount, status, transaction_ref, payment_method, purpose)
         VALUES ($1, $2, 'pending', $3, 'pay_at_venue', 'slot_booking')
         RETURNING id`,
        [user_id, amount, ref]
      );
      const paymentRecordId = paymentResult.rows[0].id;

      // Update slot to 'booked'
      await client.query("UPDATE slots SET status = 'booked' WHERE id = $1", [slot_id]);

      // Create booking record with payment_id
      const bookingResult = await client.query(
        `INSERT INTO bookings (slot_id, user_id, booking_type, status, payment_id)
         VALUES ($1, $2, 'normal', 'confirmed', $3)
         RETURNING *`,
        [slot_id, user_id, paymentRecordId]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message: `Slot booked successfully! Please pay ₹${slot.price} at the turf on arrival.`,
        booking: bookingResult.rows[0],
        payment_id: paymentRecordId,
        transaction_ref: ref,
      });
    }

    // 2. Tournament Entry via Pay at Venue
    if (purpose === "tournament_entry" || tournament_id) {
      if (!tournament_id || !team_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "tournament_id and team_id are required" });
      }

      const teamCheck = await client.query("SELECT captain_id FROM teams WHERE id = $1", [team_id]);
      if (teamCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Team not found" });
      }
      if (teamCheck.rows[0].captain_id !== user_id) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Only the team captain can register this team" });
      }

      const tourneyResult = await client.query(
        "SELECT * FROM tournaments WHERE id = $1 FOR UPDATE",
        [tournament_id]
      );
      if (tourneyResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Tournament not found" });
      }

      const tourney = tourneyResult.rows[0];
      const entryFee = Number(tourney.entry_fee || 0);

      const ref = `VEN_TRN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const paymentResult = await client.query(
        `INSERT INTO payments (user_id, amount, status, transaction_ref, payment_method, purpose)
         VALUES ($1, $2, 'pending', $3, 'pay_at_venue', 'tournament_entry')
         RETURNING id`,
        [user_id, entryFee, ref]
      );
      const paymentRecordId = paymentResult.rows[0].id;

      const countResult = await client.query(
        "SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = $1 AND status = 'registered'",
        [tournament_id]
      );
      const currentCount = parseInt(countResult.rows[0].count, 10);
      const regStatus = currentCount >= tourney.max_teams ? "waitlisted" : "registered";

      const regResult = await client.query(
        `INSERT INTO tournament_registrations (tournament_id, team_id, payment_id, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [tournament_id, team_id, paymentRecordId, regStatus]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message: "Tournament registration submitted! Please pay the entry fee at the venue.",
        registration: regResult.rows[0],
        payment_id: paymentRecordId,
        transaction_ref: ref,
      });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ error: "Invalid payment purpose" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Pay at venue error:", err);
    return res.status(500).json({ error: err.message || "Failed to process pay-at-venue booking" });
  } finally {
    client.release();
  }
}

// GET /api/payments/owner — Return payments & revenue stats for owner's turfs (or all for admin)
async function getOwnerPayments(req, res) {
  const userId = req.user.id;
  const isAdmin = req.user.role === "admin";

  try {
    let whereClause = "";
    let params = [];

    if (!isAdmin) {
      whereClause = "WHERE (t.owner_id = $1 OR tt.owner_id = $1)";
      params = [userId];
    }

    const query = `
      SELECT p.id AS payment_id, p.amount, p.status AS payment_status, p.payment_method,
             p.transaction_ref, p.purpose, p.created_at,
             p.refund_id, p.refund_status, p.refund_amount, p.refund_reason, p.refunded_at,
             u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
             b.id AS booking_id, b.status AS booking_status, b.cancellation_reason, b.cancelled_at,
             s.date AS slot_date, s.start_time, s.end_time, s.sport_type,
             COALESCE(t.name, tt.name) AS turf_name,
             COALESCE(t.location, tt.location) AS turf_location,
             tourn.name AS tournament_name
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN bookings b ON b.payment_id = p.id
      LEFT JOIN slots s ON b.slot_id = s.id
      LEFT JOIN turfs t ON s.turf_id = t.id
      LEFT JOIN tournament_registrations tr ON tr.payment_id = p.id
      LEFT JOIN tournaments tourn ON tr.tournament_id = tourn.id
      LEFT JOIN turfs tt ON tourn.turf_id = tt.id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;

    const result = await pool.query(query, params);
    const payments = result.rows;

    let totalCollected = 0;
    let totalRefunded = 0;
    let pendingAmount = 0;
    let completedCount = 0;
    let refundedCount = 0;
    let pendingCount = 0;

    payments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      const refAmt = Number(p.refund_amount) || amt;
      if (p.payment_status === "completed") {
        totalCollected += amt;
        completedCount++;
      } else if (p.payment_status === "refunded") {
        totalRefunded += refAmt;
        refundedCount++;
      } else if (p.payment_status === "pending") {
        pendingAmount += amt;
        pendingCount++;
      }
    });

    return res.json({
      summary: {
        totalRevenue: totalCollected,
        totalRefunded,
        pendingRevenue: pendingAmount,
        totalTransactions: payments.length,
        completedCount,
        refundedCount,
        pendingCount,
      },
      payments,
    });
  } catch (err) {
    console.error("Get owner payments error:", err);
    return res.status(500).json({ error: "Failed to fetch payments data" });
  }
}

// PUT /api/payments/:id/collect — Mark a pending (Pay at Venue) payment as completed
async function markPaymentCollected(req, res) {
  const paymentId = req.params.id;
  const userId = req.user.id;
  const isAdmin = req.user.role === "admin";

  try {
    let checkQuery = `
      SELECT p.*, COALESCE(t.owner_id, tt.owner_id) AS turf_owner_id
      FROM payments p
      LEFT JOIN bookings b ON b.payment_id = p.id
      LEFT JOIN slots s ON b.slot_id = s.id
      LEFT JOIN turfs t ON s.turf_id = t.id
      LEFT JOIN tournament_registrations tr ON tr.payment_id = p.id
      LEFT JOIN tournaments tourn ON tr.tournament_id = tourn.id
      LEFT JOIN turfs tt ON tourn.turf_id = tt.id
      WHERE p.id = $1
    `;

    const checkResult = await pool.query(checkQuery, [paymentId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    const payment = checkResult.rows[0];

    if (!isAdmin && payment.turf_owner_id !== userId) {
      return res.status(403).json({ error: "You are not authorized to manage payments for this turf" });
    }

    if (payment.status === "completed") {
      return res.status(400).json({ error: "Payment is already marked as completed" });
    }

    const updateResult = await pool.query(
      `UPDATE payments
       SET status = 'completed',
           transaction_ref = COALESCE(transaction_ref, 'CASH_COLLECTED') || ' [COLLECTED]'
       WHERE id = $1
       RETURNING *`,
      [paymentId]
    );

    return res.json({
      success: true,
      message: "Payment successfully marked as collected!",
      payment: updateResult.rows[0],
    });
  } catch (err) {
    console.error("Mark payment collected error:", err);
    return res.status(500).json({ error: "Failed to update payment status" });
  }
}

// POST /api/payments/:id/refund — Owner or Admin issues a refund (e.g. false booking, dispute, emergency)
async function refundPayment(req, res) {
  const paymentId = req.params.id;
  const { reason = "False booking / Turf management refund" } = req.body;
  const userId = req.user.id;
  const isAdmin = req.user.role === "admin";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockRes = await client.query("SELECT * FROM payments WHERE id = $1 FOR UPDATE", [paymentId]);
    if (lockRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payment record not found" });
    }

    const checkQuery = `
      SELECT p.*, COALESCE(t.owner_id, tt.owner_id) AS turf_owner_id,
             b.id AS booking_id, b.slot_id, b.status AS booking_status
      FROM payments p
      LEFT JOIN bookings b ON b.payment_id = p.id
      LEFT JOIN slots s ON b.slot_id = s.id
      LEFT JOIN turfs t ON s.turf_id = t.id
      LEFT JOIN tournament_registrations tr ON tr.payment_id = p.id
      LEFT JOIN tournaments tourn ON tr.tournament_id = tourn.id
      LEFT JOIN turfs tt ON tourn.turf_id = tt.id
      WHERE p.id = $1
    `;

    const checkResult = await client.query(checkQuery, [paymentId]);

    const payment = checkResult.rows[0];

    if (!isAdmin && payment.turf_owner_id !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not authorized to refund payments for this turf" });
    }

    if (payment.status === "refunded") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This payment has already been refunded" });
    }

    const refundInfo = await executeRefundHelper({
      client,
      paymentId,
      reason,
      refundAmount: payment.amount,
    });

    // If associated booking exists and is confirmed, cancel it and release slot
    if (payment.booking_id && payment.booking_status !== "cancelled") {
      await client.query(
        "UPDATE bookings SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW() WHERE id = $2",
        [`Refunded by turf management: ${reason}`, payment.booking_id]
      );
      if (payment.slot_id) {
        await client.query("UPDATE slots SET status = 'available' WHERE id = $1", [payment.slot_id]);
      }
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: `Refund of ₹${refundInfo.amount} processed successfully (Refund ID: ${refundInfo.refundId})`,
      refund: {
        refund_id: refundInfo.refundId,
        amount: refundInfo.amount,
        status: refundInfo.status,
        reason,
      },
      payment: refundInfo.payment,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Refund payment error:", err);
    return res.status(500).json({ error: err.message || "Failed to process refund" });
  } finally {
    client.release();
  }
}

module.exports = {
  getPaymentConfig,
  createOrder,
  verifyPayment,
  payAtVenue,
  getOwnerPayments,
  markPaymentCollected,
  getMyPayments,
  refundPayment,
  executeRefundHelper,
};

