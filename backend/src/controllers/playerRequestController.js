const { pool } = require("../config/db");

// POST /api/player-requests — either a captain invites a player, or a player asks to join a team
async function createRequest(req, res) {
  const { player_id, team_id, tournament_id } = req.body;
  if (!player_id || !team_id) {
    return res.status(400).json({ error: "player_id and team_id are required" });
  }

  try {
    const playerResult = await pool.query("SELECT user_id FROM players WHERE id = $1", [player_id]);
    if (playerResult.rows.length === 0) return res.status(404).json({ error: "Player profile not found" });

    const teamResult = await pool.query("SELECT captain_id FROM teams WHERE id = $1", [team_id]);
    if (teamResult.rows.length === 0) return res.status(404).json({ error: "Team not found" });

    const isThePlayer = playerResult.rows[0].user_id === req.user.id;
    const isTheCaptain = teamResult.rows[0].captain_id === req.user.id;

    if (!isThePlayer && !isTheCaptain) {
      return res.status(403).json({ error: "You must be either this player or this team's captain to create this request" });
    }

    const result = await pool.query(
      `INSERT INTO player_requests (player_id, team_id, tournament_id, requested_by, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [player_id, team_id, tournament_id || null, req.user.id]
    );
    return res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    console.error("Create player request error:", err.message);
    return res.status(500).json({ error: "Failed to create request" });
  }
}

// GET /api/player-requests/mine — every request involving you, either side
async function getMyRequests(req, res) {
  try {
    const result = await pool.query(
      `SELECT pr.*, t.name AS team_name, u.name AS player_name, u.email AS player_email, u.id AS player_user_id
       FROM player_requests pr
       JOIN teams t ON pr.team_id = t.id
       JOIN players p ON pr.player_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1 OR t.captain_id = $1
       ORDER BY pr.created_at DESC`,
      [req.user.id]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error("Get my requests error:", err.message);
    return res.status(500).json({ error: "Failed to fetch requests" });
  }
}

// PUT /api/player-requests/:id/respond — only the OTHER side (not the initiator) can respond
async function respondToRequest(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  if (!["accepted", "declined"].includes(status)) {
    return res.status(400).json({ error: "status must be accepted or declined" });
  }

  try {
    const result = await pool.query(
      `SELECT pr.*, p.user_id AS player_user_id, t.captain_id
       FROM player_requests pr
       JOIN players p ON pr.player_id = p.id
       JOIN teams t ON pr.team_id = t.id
       WHERE pr.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Request not found" });

    const reqRow = result.rows[0];
    if (reqRow.status !== "pending") {
      return res.status(409).json({ error: `This request was already ${reqRow.status}` });
    }

    // Whoever DIDN'T initiate it is the one allowed to respond
    const responder = reqRow.requested_by === reqRow.player_user_id ? reqRow.captain_id : reqRow.player_user_id;
    if (req.user.id !== responder) {
      return res.status(403).json({ error: "Only the other party can respond to this request" });
    }

    await pool.query("UPDATE player_requests SET status = $1 WHERE id = $2", [status, id]);

    if (status === "accepted") {
      await pool.query(
        `INSERT INTO team_players (team_id, player_id) VALUES ($1, $2)
         ON CONFLICT (team_id, player_id) DO NOTHING`,
        [reqRow.team_id, reqRow.player_user_id]
      );
    }

    return res.json({ message: `Request ${status}` });
  } catch (err) {
    console.error("Respond to request error:", err.message);
    return res.status(500).json({ error: "Failed to respond to request" });
  }
}

module.exports = { createRequest, getMyRequests, respondToRequest };