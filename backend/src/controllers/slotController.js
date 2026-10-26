const { pool } = require("../config/db");

// Helper: confirms the logged-in user actually owns this turf (or is admin)
async function verifyTurfOwnership(turfId, userId, userRole) {
  const result = await pool.query("SELECT owner_id FROM turfs WHERE id = $1", [turfId]);
  if (result.rows.length === 0) return { ok: false, reason: "not_found" };
  if (result.rows[0].owner_id !== userId && userRole !== "admin") {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true };
}

// POST /api/turfs/:turfId/slots/generate — Owner only
// Body: { turf_sport_id, date_from, date_to, start_time, end_time, slot_duration_minutes }
async function generateSlots(req, res) {
  const { turfId } = req.params;
  const { turf_sport_id, date_from, date_to, start_time, end_time, slot_duration_minutes } = req.body;

  if (!turf_sport_id || !date_from || !date_to || !start_time || !end_time || !slot_duration_minutes) {
    return res.status(400).json({
      error: "turf_sport_id, date_from, date_to, start_time, end_time, and slot_duration_minutes are required",
    });
  }

  try {
    const ownership = await verifyTurfOwnership(turfId, req.user.id, req.user.role);
    if (!ownership.ok) {
      return res.status(ownership.reason === "not_found" ? 404 : 403)
        .json({ error: ownership.reason === "not_found" ? "Turf not found" : "You do not own this turf" });
    }

    const sportResult = await pool.query(
      "SELECT * FROM turf_sports WHERE id = $1 AND turf_id = $2",
      [turf_sport_id, turfId]
    );
    if (sportResult.rows.length === 0) {
      return res.status(404).json({ error: "This sport is not configured for this turf" });
    }
    const { sport_type, price_per_hour } = sportResult.rows[0];

    // Find any active tournament on this turf/sport that overlaps the requested date range
    const tourneyResult = await pool.query(
      `SELECT start_date, end_date FROM tournaments
       WHERE turf_id = $1 AND sport = $2 AND status IN ('upcoming', 'ongoing')
         AND NOT (end_date < $3 OR start_date > $4)`,
      [turfId, sport_type, date_from, date_to]
    );
    const blockedRanges = tourneyResult.rows; // [{ start_date, end_date }, ...]

    function fallsInTournament(dateStr) {
      const d = new Date(dateStr);
      return blockedRanges.some((r) => d >= new Date(r.start_date) && d <= new Date(r.end_date));
    }

    const slotsToInsert = [];
    let currentDate = new Date(date_from);
    const lastDate = new Date(date_to);

    while (currentDate <= lastDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const slotStatus = fallsInTournament(dateStr) ? "blocked" : "available";

      let [h, m] = start_time.split(":").map(Number);
      const [endH, endM] = end_time.split(":").map(Number);

      while (h < endH || (h === endH && m < endM)) {
        const slotStart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
        m += slot_duration_minutes;
        while (m >= 60) { m -= 60; h += 1; }
        const slotEnd = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

        if (h < endH || (h === endH && m <= endM)) {
          slotsToInsert.push([turfId, dateStr, slotStart, slotEnd, sport_type, price_per_hour, slotStatus]);
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (slotsToInsert.length === 0) {
      return res.status(400).json({ error: "No valid slots generated — check your time range" });
    }

    let inserted = 0;
    let blockedCount = 0;
    for (const [turf_id, date, start, end, sport, price, status] of slotsToInsert) {
      const result = await pool.query(
        `INSERT INTO slots (turf_id, date, start_time, end_time, status, sport_type, price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (turf_id, date, start_time) DO NOTHING
         RETURNING id`,
        [turf_id, date, start, end, status, sport, price]
      );
      if (result.rows.length > 0) {
        inserted++;
        if (status === "blocked") blockedCount++;
      }
    }

    return res.status(201).json({
      message: `${inserted} ${sport_type} slot(s) created${blockedCount > 0 ? ` (${blockedCount} pre-blocked due to an active tournament)` : ""}`,
      total_attempted: slotsToInsert.length,
      skipped_duplicates: slotsToInsert.length - inserted,
      blocked_for_tournament: blockedCount,
    });
  } catch (err) {
    console.error("Generate slots error:", err.message);
    return res.status(500).json({ error: "Failed to generate slots" });
  }
}

// GET /api/turfs/:turfId/slots?date=YYYY-MM-DD&sport_type=football — Public
async function getSlotsByTurf(req, res) {
  const { turfId } = req.params;
  const { date, sport_type } = req.query;

  try {
    const turfCheck = await pool.query("SELECT * FROM turfs WHERE id = $1", [turfId]);
    if (turfCheck.rows.length === 0) {
      return res.status(404).json({ error: "Turf not found" });
    }

    // 1. Fetch sports configured for this turf (auto-seed if empty)
    let sportsRes = await pool.query(
      "SELECT id, turf_id, TRIM(sport_type) AS sport_type, price_per_hour, peak_price FROM turf_sports WHERE turf_id = $1 ORDER BY id ASC",
      [turfId]
    );

    if (sportsRes.rows.length === 0) {
      await pool.query(
        `INSERT INTO turf_sports (turf_id, sport_type, price_per_hour, peak_price)
         VALUES 
           ($1, 'Football', 800, 1000),
           ($1, 'Cricket', 900, 1200),
           ($1, 'Badminton', 600, 800)
         ON CONFLICT (turf_id, sport_type) DO NOTHING`,
        [turfId]
      );
      sportsRes = await pool.query(
        "SELECT id, turf_id, TRIM(sport_type) AS sport_type, price_per_hour, peak_price FROM turf_sports WHERE turf_id = $1 ORDER BY id ASC",
        [turfId]
      );
    }

    const targetDate = date || new Date().toISOString().split("T")[0];

    // Determine pricing based on selected sport
    let activeSportConfig = null;
    if (sport_type) {
      activeSportConfig = sportsRes.rows.find(
        (s) => s.sport_type.toLowerCase() === sport_type.trim().toLowerCase()
      );
    }
    if (!activeSportConfig && sportsRes.rows.length > 0) {
      activeSportConfig = sportsRes.rows[0];
    }

    const chosenSport = activeSportConfig ? activeSportConfig.sport_type : (sport_type || "Football");
    const defaultPrice = Number(activeSportConfig?.price_per_hour || 800);
    const peakPrice = Number(activeSportConfig?.peak_price || defaultPrice);

    // 2. Fetch existing slots for this turf and date
    let existingSlots = await pool.query(
      "SELECT * FROM slots WHERE turf_id = $1 AND date = $2 ORDER BY start_time ASC",
      [turfId, targetDate]
    );

    // 3. If no slots exist for this date, automatically generate standard daily slots
    if (existingSlots.rows.length === 0) {
      const tourneyResult = await pool.query(
        `SELECT start_date, end_date FROM tournaments
         WHERE turf_id = $1 AND status IN ('upcoming', 'ongoing')
           AND start_date <= $2 AND end_date >= $2`,
        [turfId, targetDate]
      );
      const isBlocked = tourneyResult.rows.length > 0;
      const initialStatus = isBlocked ? "blocked" : "available";

      for (let h = 6; h < 23; h++) {
        const startH = String(h).padStart(2, "0");
        const endH = String(h + 1).padStart(2, "0");
        const startTime = `${startH}:00:00`;
        const endTime = `${endH}:00:00`;
        const slotPrice = h >= 18 ? peakPrice : defaultPrice;

        await pool.query(
          `INSERT INTO slots (turf_id, date, start_time, end_time, status, sport_type, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (turf_id, date, start_time) DO NOTHING`,
          [turfId, targetDate, startTime, endTime, initialStatus, chosenSport, slotPrice]
        );
      }

      existingSlots = await pool.query(
        "SELECT * FROM slots WHERE turf_id = $1 AND date = $2 ORDER BY start_time ASC",
        [turfId, targetDate]
      );
    }

    // 4. Return slots with prices matching the chosen sport for available slots
    const formattedSlots = existingSlots.rows.map((slot) => {
      const startHour = parseInt(String(slot.start_time).slice(0, 2), 10);
      const currentPrice =
        slot.status === "available"
          ? (startHour >= 18 ? peakPrice : defaultPrice)
          : Number(slot.price);

      return {
        ...slot,
        sport_type: slot.status === "available" ? chosenSport : (slot.sport_type || chosenSport),
        price: currentPrice,
      };
    });

    return res.json({ slots: formattedSlots });
  } catch (err) {
    console.error("Get slots error:", err.message);
    return res.status(500).json({ error: "Failed to fetch slots" });
  }
}

// PUT /api/slots/:id/block — Owner only (e.g. maintenance)
async function blockSlot(req, res) {
  const { id } = req.params;

  try {
    const slotResult = await pool.query("SELECT turf_id, status FROM slots WHERE id = $1", [id]);
    if (slotResult.rows.length === 0) {
      return res.status(404).json({ error: "Slot not found" });
    }

    const ownership = await verifyTurfOwnership(slotResult.rows[0].turf_id, req.user.id, req.user.role);
    if (!ownership.ok) {
      return res.status(403).json({ error: "You do not own this turf" });
    }

    if (slotResult.rows[0].status === "booked") {
      return res.status(409).json({ error: "Cannot block a slot that's already booked" });
    }

    const result = await pool.query(
      "UPDATE slots SET status = 'blocked' WHERE id = $1 RETURNING *",
      [id]
    );
    return res.json({ slot: result.rows[0] });
  } catch (err) {
    console.error("Block slot error:", err.message);
    return res.status(500).json({ error: "Failed to block slot" });
  }
}

module.exports = { generateSlots, getSlotsByTurf, blockSlot };