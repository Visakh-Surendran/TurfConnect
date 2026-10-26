const { pool } = require("../config/db");

// POST /api/players — create or update your own player profile (upsert)
async function upsertProfile(req, res) {
  const { sport, position, skill_level, location } = req.body;
  if (!sport) return res.status(400).json({ error: "sport is required" });

  const allowedLevels = ["beginner", "intermediate", "pro"];
  const finalSkill = allowedLevels.includes(skill_level) ? skill_level : "beginner";

  try {
    const result = await pool.query(
      `INSERT INTO players (user_id, sport, position, skill_level, location)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         sport = EXCLUDED.sport,
         position = EXCLUDED.position,
         skill_level = EXCLUDED.skill_level,
         location = EXCLUDED.location,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, sport, position || null, finalSkill, location || null]
    );
    return res.status(201).json({ profile: result.rows[0] });
  } catch (err) {
    console.error("Upsert player profile error:", err.message);
    return res.status(500).json({ error: "Failed to save player profile" });
  }
}

// GET /api/players/me — your own profile
async function getMyProfile(req, res) {
  try {
    const result = await pool.query("SELECT * FROM players WHERE user_id = $1", [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No player profile yet — create one first" });
    }
    return res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error("Get my profile error:", err.message);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
}

// GET /api/players — public search, defaults to available players only
// GET /api/players — public search, defaults to available players only
async function searchPlayers(req, res) {
  const { sport, position, skill_level, location, availability_status, search } = req.query;

  try {
    let query = `
      SELECT p.*, u.name, u.email
      FROM players p JOIN users u ON p.user_id = u.id
      WHERE p.availability_status = $1`;
    const params = [availability_status === "false" ? false : true];

    if (sport) { params.push(sport); query += ` AND p.sport = $${params.length}`; }
    if (position) { params.push(position); query += ` AND p.position ILIKE $${params.length}`; }
    if (skill_level) { params.push(skill_level); query += ` AND p.skill_level = $${params.length}`; }
    if (location) { params.push(`%${location}%`); query += ` AND p.location ILIKE $${params.length}`; }

    // New: search by name OR email, partial match, case-insensitive
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    query += " ORDER BY p.updated_at DESC";

    const result = await pool.query(query, params);
    return res.json({ players: result.rows });
  } catch (err) {
    console.error("Search players error:", err.message);
    return res.status(500).json({ error: "Failed to search players" });
  }
}

// PUT /api/players/availability — toggle your own availability
async function updateAvailability(req, res) {
  const { availability_status } = req.body;
  if (typeof availability_status !== "boolean") {
    return res.status(400).json({ error: "availability_status must be true or false" });
  }
  try {
    const result = await pool.query(
      "UPDATE players SET availability_status = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *",
      [availability_status, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No player profile yet — create one first" });
    }
    return res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error("Update availability error:", err.message);
    return res.status(500).json({ error: "Failed to update availability" });
  }
}

module.exports = { upsertProfile, getMyProfile, searchPlayers, updateAvailability };