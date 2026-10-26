const { pool } = require("../config/db");

async function verifyOrganizerOfFixture(fixtureId, userId, userRole) {
  const result = await pool.query(
    `SELECT t.organizer_id, t.format, f.team1_id, f.team2_id
     FROM fixtures f JOIN tournaments t ON f.tournament_id = t.id
     WHERE f.id = $1`,
    [fixtureId]
  );
  if (result.rows.length === 0) return { ok: false, reason: "not_found" };
  if (result.rows[0].organizer_id !== userId && userRole !== "admin") {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, fixture: result.rows[0] };
}

// PUT /api/fixtures/:id/result — Organizer/Admin enters a match result
async function submitResult(req, res) {
  const { id } = req.params;
  const { team1_score, team2_score, winner_id } = req.body;

  if (team1_score === undefined || team2_score === undefined) {
    return res.status(400).json({ error: "team1_score and team2_score are required" });
  }

  try {
    const check = await verifyOrganizerOfFixture(id, req.user.id, req.user.role);
    if (!check.ok) {
      return res.status(check.reason === "not_found" ? 404 : 403)
        .json({ error: check.reason === "not_found" ? "Fixture not found" : "You are not the organizer" });
    }

    let finalWinnerId = winner_id || null;
    if (team1_score === team2_score) {
      if (check.fixture.format === "knockout" && !winner_id) {
        return res.status(400).json({ error: "Knockout matches can't end in a draw — provide winner_id to break the tie" });
      }
      // round_robin/league allow draws — winner stays null
    } else {
      finalWinnerId = team1_score > team2_score ? check.fixture.team1_id : check.fixture.team2_id;
    }

    const result = await pool.query(
      `INSERT INTO match_results (fixture_id, team1_score, team2_score, winner_id, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (fixture_id) DO UPDATE SET
         team1_score = EXCLUDED.team1_score,
         team2_score = EXCLUDED.team2_score,
         winner_id = EXCLUDED.winner_id,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [id, team1_score, team2_score, finalWinnerId, req.user.id]
    );

    await pool.query("UPDATE fixtures SET status = 'completed' WHERE id = $1", [id]);

    return res.json({ result: result.rows[0] });
  } catch (err) {
    console.error("Submit result error:", err.message);
    return res.status(500).json({ error: "Failed to submit result" });
  }
}

// GET /api/tournaments/:id/standings — public (round-robin/league points table)
async function getStandings(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `WITH all_matches AS (
         SELECT f.team1_id AS team_id, mr.team1_score AS scored, mr.team2_score AS conceded,
                CASE WHEN mr.winner_id = f.team1_id THEN 1 ELSE 0 END AS won,
                CASE WHEN mr.winner_id IS NULL THEN 1 ELSE 0 END AS drawn,
                CASE WHEN mr.winner_id IS NOT NULL AND mr.winner_id != f.team1_id THEN 1 ELSE 0 END AS lost
         FROM fixtures f JOIN match_results mr ON mr.fixture_id = f.id
         WHERE f.tournament_id = $1 AND f.team2_id IS NOT NULL
         UNION ALL
         SELECT f.team2_id AS team_id, mr.team2_score AS scored, mr.team1_score AS conceded,
                CASE WHEN mr.winner_id = f.team2_id THEN 1 ELSE 0 END AS won,
                CASE WHEN mr.winner_id IS NULL THEN 1 ELSE 0 END AS drawn,
                CASE WHEN mr.winner_id IS NOT NULL AND mr.winner_id != f.team2_id THEN 1 ELSE 0 END AS lost
         FROM fixtures f JOIN match_results mr ON mr.fixture_id = f.id
         WHERE f.tournament_id = $1 AND f.team2_id IS NOT NULL
       )
       SELECT tm.id AS team_id, tm.name,
         COUNT(*) AS played,
         SUM(am.won) AS won, SUM(am.drawn) AS drawn, SUM(am.lost) AS lost,
         SUM(am.scored) AS scored, SUM(am.conceded) AS conceded,
         (SUM(am.won) * 3 + SUM(am.drawn) * 1) AS points
       FROM all_matches am JOIN teams tm ON am.team_id = tm.id
       GROUP BY tm.id, tm.name
       ORDER BY points DESC, (SUM(am.scored) - SUM(am.conceded)) DESC`,
      [id]
    );
    return res.json({ standings: result.rows });
  } catch (err) {
    console.error("Get standings error:", err.message);
    return res.status(500).json({ error: "Failed to fetch standings" });
  }
}

module.exports = { submitResult, getStandings };