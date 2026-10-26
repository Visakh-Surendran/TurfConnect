const { pool } = require("../config/db");

// POST /api/ratings — rate a turf or a player after a booking/tournament
async function submitRating(req, res) {
  const { rated_id, context, context_id, score, comment } = req.body;

  if (!rated_id || !context || !context_id || !score) {
    return res.status(400).json({ error: "rated_id, context, context_id, and score are required" });
  }
  if (!["turf", "player"].includes(context)) {
    return res.status(400).json({ error: "context must be 'turf' or 'player'" });
  }
  if (score < 1 || score > 5) {
    return res.status(400).json({ error: "score must be between 1 and 5" });
  }
  if (context === "player" && rated_id === req.user.id) {
    return res.status(400).json({ error: "You cannot rate yourself" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ratings (rater_id, rated_id, context, context_id, score, comment)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, rated_id, context, context_id, score, comment || null]
    );
    return res.status(201).json({ rating: result.rows[0] });
  } catch (err) {
    console.error("Submit rating error:", err.message);
    return res.status(500).json({ error: "Failed to submit rating" });
  }
}

// GET /api/ratings/user/:userId — a player's reputation
async function getRatingsForUser(req, res) {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.*, u.name AS rater_name FROM ratings r JOIN users u ON r.rater_id = u.id
       WHERE r.rated_id = $1 AND r.context = 'player' ORDER BY r.created_at DESC`,
      [userId]
    );
    const avgResult = await pool.query(
      "SELECT AVG(score)::numeric(3,2) AS average, COUNT(*) AS total FROM ratings WHERE rated_id = $1 AND context = 'player'",
      [userId]
    );
    return res.json({ ratings: result.rows, average: avgResult.rows[0].average, total: avgResult.rows[0].total });
  } catch (err) {
    console.error("Get user ratings error:", err.message);
    return res.status(500).json({ error: "Failed to fetch ratings" });
  }
}

// GET /api/ratings/turf/:turfId
async function getRatingsForTurf(req, res) {
  const { turfId } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.*, u.name AS rater_name FROM ratings r JOIN users u ON r.rater_id = u.id
       WHERE r.context_id = $1 AND r.context = 'turf' ORDER BY r.created_at DESC`,
      [turfId]
    );
    const avgResult = await pool.query(
      "SELECT AVG(score)::numeric(3,2) AS average, COUNT(*) AS total FROM ratings WHERE context_id = $1 AND context = 'turf'",
      [turfId]
    );
    return res.json({ ratings: result.rows, average: avgResult.rows[0].average, total: avgResult.rows[0].total });
  } catch (err) {
    console.error("Get turf ratings error:", err.message);
    return res.status(500).json({ error: "Failed to fetch ratings" });
  }
}

module.exports = { submitRating, getRatingsForUser, getRatingsForTurf };