const { pool } = require("../config/db");

// POST /api/teams — any logged-in user can create a team (becomes captain)
async function createTeam(req, res) {
  const { name, sport } = req.body;
  if (!name || !sport) {
    return res.status(400).json({ error: "name and sport are required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO teams (name, captain_id, sport) VALUES ($1, $2, $3) RETURNING *`,
      [name, req.user.id, sport]
    );
    // Captain is automatically a member of their own team
    await pool.query(
      `INSERT INTO team_players (team_id, player_id, role_in_team) VALUES ($1, $2, 'captain')`,
      [result.rows[0].id, req.user.id]
    );
    return res.status(201).json({ team: result.rows[0] });
  } catch (err) {
    console.error("Create team error:", err.message);
    return res.status(500).json({ error: "Failed to create team" });
  }
}

// GET /api/teams/mine — teams the logged-in user captains
async function getMyTeams(req, res) {
  try {
    const result = await pool.query(
      "SELECT * FROM teams WHERE captain_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({ teams: result.rows });
  } catch (err) {
    console.error("Get my teams error:", err.message);
    return res.status(500).json({ error: "Failed to fetch teams" });
  }
}

// GET /api/teams/:id — public, includes roster
async function getTeamById(req, res) {
  const { id } = req.params;
  try {
    const teamResult = await pool.query("SELECT * FROM teams WHERE id = $1", [id]);
    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: "Team not found" });
    }
    const playersResult = await pool.query(
      `SELECT u.id, u.name, u.email, tp.role_in_team
       FROM team_players tp JOIN users u ON tp.player_id = u.id
       WHERE tp.team_id = $1`,
      [id]
    );
    return res.json({ team: { ...teamResult.rows[0], players: playersResult.rows } });
  } catch (err) {
    console.error("Get team error:", err.message);
    return res.status(500).json({ error: "Failed to fetch team" });
  }
}

// POST /api/teams/:id/players — captain adds a player by email
async function addPlayerToTeam(req, res) {
  const { id } = req.params;
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  try {
    const teamResult = await pool.query("SELECT captain_id FROM teams WHERE id = $1", [id]);
    if (teamResult.rows.length === 0) return res.status(404).json({ error: "Team not found" });
    if (teamResult.rows[0].captain_id !== req.user.id) {
      return res.status(403).json({ error: "Only the team captain can add players" });
    }

    const userResult = await pool.query("SELECT id, role FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "No user found with this email" });
    }
    if (userResult.rows[0].role !== "player") {
      return res.status(400).json({ error: "Only accounts with role 'player' can be added to a team" });
    }

    const result = await pool.query(
      `INSERT INTO team_players (team_id, player_id) VALUES ($1, $2) RETURNING *`,
      [id, userResult.rows[0].id]
    );
    return res.status(201).json({ teamPlayer: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This player is already on the team" });
    }
    console.error("Add player error:", err.message);
    return res.status(500).json({ error: "Failed to add player" });
  }
}


module.exports = { createTeam, getMyTeams, getTeamById, addPlayerToTeam };