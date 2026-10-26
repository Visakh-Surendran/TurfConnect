const { pool } = require("../config/db");

// POST /api/tournaments — any logged-in user can organize a tournament
async function createTournament(req, res) {
  const { turf_id, name, sport, format, max_teams, entry_fee, start_date, end_date } = req.body;

  if (!turf_id || !name || !sport || !format || !max_teams || !start_date || !end_date) {
    return res.status(400).json({ error: "turf_id, name, sport, format, max_teams, start_date, end_date are required" });
  }
  if (!["knockout", "round_robin", "league"].includes(format)) {
    return res.status(400).json({ error: "format must be knockout, round_robin, or league" });
  }

  try {
    const turfCheck = await pool.query("SELECT status FROM turfs WHERE id = $1", [turf_id]);
    if (turfCheck.rows.length === 0) return res.status(404).json({ error: "Turf not found" });
    if (turfCheck.rows[0].status !== "approved") {
      return res.status(400).json({ error: "Tournament can only be hosted on an approved turf" });
    }

    const result = await pool.query(
      `INSERT INTO tournaments (turf_id, organizer_id, name, sport, format, max_teams, entry_fee, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [turf_id, req.user.id, name, sport, format, max_teams, entry_fee || 0, start_date, end_date]
    );

    // Block any already-generated slots for this turf/sport that fall within
    // the tournament's date range, so normal players can't book over it.
    const blockResult = await pool.query(
      `UPDATE slots SET status = 'blocked'
       WHERE turf_id = $1 AND sport_type = $2
         AND date BETWEEN $3 AND $4
         AND status = 'available'`,
      [turf_id, sport, start_date, end_date]
    );

    return res.status(201).json({
      tournament: result.rows[0],
      slots_blocked: blockResult.rowCount,
    });
  } catch (err) {
    console.error("Create tournament error:", err.message);
    return res.status(500).json({ error: "Failed to create tournament" });
  }
}

// GET /api/tournaments — public listing
async function getAllTournaments(req, res) {
  const { sport, status } = req.query;
  try {
    let query = `
      SELECT t.*, tf.name AS turf_name, tf.location,
        (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.tournament_id = t.id AND tr.status = 'registered') AS registered_count
      FROM tournaments t JOIN turfs tf ON t.turf_id = tf.id
      WHERE 1=1`;
    const params = [];
    if (sport) { params.push(sport); query += ` AND t.sport = $${params.length}`; }
    if (status) { params.push(status); query += ` AND t.status = $${params.length}`; }
    query += " ORDER BY t.start_date ASC";

    const result = await pool.query(query, params);
    return res.json({ tournaments: result.rows });
  } catch (err) {
    console.error("Get tournaments error:", err.message);
    return res.status(500).json({ error: "Failed to fetch tournaments" });
  }
}

// GET /api/tournaments/:id — public detail
async function getTournamentById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT t.*, tf.name AS turf_name, tf.location
       FROM tournaments t JOIN turfs tf ON t.turf_id = tf.id WHERE t.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Tournament not found" });
    return res.json({ tournament: result.rows[0] });
  } catch (err) {
    console.error("Get tournament error:", err.message);
    return res.status(500).json({ error: "Failed to fetch tournament" });
  }
}

// POST /api/tournaments/:id/register — team captain registers their team
async function registerTeam(req, res) {
  const { id } = req.params;
  const { team_id } = req.body;
  if (!team_id) return res.status(400).json({ error: "team_id is required" });

  try {
    const teamCheck = await pool.query("SELECT captain_id FROM teams WHERE id = $1", [team_id]);
    if (teamCheck.rows.length === 0) return res.status(404).json({ error: "Team not found" });
    if (teamCheck.rows[0].captain_id !== req.user.id) {
      return res.status(403).json({ error: "Only the team captain can register this team" });
    }

    const tourneyResult = await pool.query("SELECT max_teams FROM tournaments WHERE id = $1", [id]);
    if (tourneyResult.rows.length === 0) return res.status(404).json({ error: "Tournament not found" });

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = $1 AND status = 'registered'",
      [id]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);
    const status = currentCount >= tourneyResult.rows[0].max_teams ? "waitlisted" : "registered";

    const result = await pool.query(
      `INSERT INTO tournament_registrations (tournament_id, team_id, status)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, team_id, status]
    );
    return res.status(201).json({ registration: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This team is already registered for this tournament" });
    }
    console.error("Register team error:", err.message);
    return res.status(500).json({ error: "Failed to register team" });
  }
}

// GET /api/tournaments/:id/teams — public
async function getRegisteredTeams(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT tm.id, tm.name, tr.status AS registration_status
       FROM tournament_registrations tr JOIN teams tm ON tr.team_id = tm.id
       WHERE tr.tournament_id = $1`,
      [id]
    );
    return res.json({ teams: result.rows });
  } catch (err) {
    console.error("Get registered teams error:", err.message);
    return res.status(500).json({ error: "Failed to fetch registered teams" });
  }
}

module.exports = { createTournament, getAllTournaments, getTournamentById, registerTeam, getRegisteredTeams };