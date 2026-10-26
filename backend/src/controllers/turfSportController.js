const { pool } = require("../config/db");

async function verifyTurfOwnership(turfId, userId, userRole) {
  const result = await pool.query("SELECT owner_id FROM turfs WHERE id = $1", [turfId]);
  if (result.rows.length === 0) return { ok: false, reason: "not_found" };
  if (result.rows[0].owner_id !== userId && userRole !== "admin") {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true };
}

// POST /api/turfs/:turfId/sports — Owner adds a sport + its pricing to their turf
async function addTurfSport(req, res) {
  const { turfId } = req.params;
  const { sport_type, price_per_hour, peak_price } = req.body;

  if (!sport_type || !price_per_hour) {
    return res.status(400).json({ error: "sport_type and price_per_hour are required" });
  }

  try {
    const ownership = await verifyTurfOwnership(turfId, req.user.id, req.user.role);
    if (!ownership.ok) {
      return res.status(ownership.reason === "not_found" ? 404 : 403)
        .json({ error: ownership.reason === "not_found" ? "Turf not found" : "You do not own this turf" });
    }

    const result = await pool.query(
      `INSERT INTO turf_sports (turf_id, sport_type, price_per_hour, peak_price)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [turfId, sport_type, price_per_hour, peak_price || null]
    );
    return res.status(201).json({ turfSport: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") { // unique_violation
      return res.status(409).json({ error: "This sport is already added to this turf" });
    }
    console.error("Add turf sport error:", err.message);
    return res.status(500).json({ error: "Failed to add sport" });
  }
}

// GET /api/turfs/:turfId/sports — Public
async function getTurfSports(req, res) {
  const { turfId } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM turf_sports WHERE turf_id = $1 ORDER BY sport_type",
      [turfId]
    );
    return res.json({ sports: result.rows });
  } catch (err) {
    console.error("Get turf sports error:", err.message);
    return res.status(500).json({ error: "Failed to fetch sports" });
  }
}

// PUT /api/turfs/:turfId/sports/:sportId — Owner updates pricing for one sport
async function updateTurfSport(req, res) {
  const { turfId, sportId } = req.params;
  const { price_per_hour, peak_price } = req.body;

  try {
    const ownership = await verifyTurfOwnership(turfId, req.user.id, req.user.role);
    if (!ownership.ok) {
      return res.status(ownership.reason === "not_found" ? 404 : 403)
        .json({ error: ownership.reason === "not_found" ? "Turf not found" : "You do not own this turf" });
    }

    const result = await pool.query(
      `UPDATE turf_sports SET
         price_per_hour = COALESCE($1, price_per_hour),
         peak_price = COALESCE($2, peak_price)
       WHERE id = $3 AND turf_id = $4
       RETURNING *`,
      [price_per_hour, peak_price, sportId, turfId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Sport entry not found for this turf" });
    }
    return res.json({ turfSport: result.rows[0] });
  } catch (err) {
    console.error("Update turf sport error:", err.message);
    return res.status(500).json({ error: "Failed to update sport pricing" });
  }
}

module.exports = { addTurfSport, getTurfSports, updateTurfSport };