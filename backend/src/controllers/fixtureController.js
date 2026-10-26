const { pool } = require("../config/db");

// Fisher-Yates shuffle — used so team order in fixtures isn't just registration order
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function verifyOrganizer(tournamentId, userId, userRole) {
  const result = await pool.query("SELECT organizer_id FROM tournaments WHERE id = $1", [tournamentId]);
  if (result.rows.length === 0) return { ok: false, reason: "not_found" };
  if (result.rows[0].organizer_id !== userId && userRole !== "admin") {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, tournament: result.rows[0] };
}

// Round-robin using the circle method: one team fixed, rest rotate each round.
// Produces (n-1) rounds where every team plays every other team exactly once.
function generateRoundRobinPairs(teamIds) {
  let teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(null); // null = "bye" for this round

  const n = teams.length;
  const rounds = [];

  for (let round = 0; round < n - 1; round++) {
    const roundPairs = [];
    for (let i = 0; i < n / 2; i++) {
      const t1 = teams[i];
      const t2 = teams[n - 1 - i];
      if (t1 !== null && t2 !== null) {
        roundPairs.push([t1, t2]);
      }
    }
    rounds.push(roundPairs);

    // Rotate everyone except the fixed first team
    const fixed = teams[0];
    const rest = teams.slice(1);
    rest.unshift(rest.pop());
    teams = [fixed, ...rest];
  }
  return rounds; // array of rounds, each an array of [team1, team2] pairs
}

// Knockout round 1: pad to next power of 2 with byes, assign byes to first N shuffled teams
function generateKnockoutRound1(teamIds) {
  const n = teamIds.length;
  let nextPow2 = 1;
  while (nextPow2 < n) nextPow2 *= 2;
  const numByes = nextPow2 - n;

  const pairs = [];
  let idx = 0;

  // Teams that get a bye (auto-advance, no opponent this round)
  for (let i = 0; i < numByes; i++) {
    pairs.push([teamIds[idx], null]);
    idx++;
  }
  // Remaining teams paired up normally
  while (idx < teamIds.length) {
    pairs.push([teamIds[idx], teamIds[idx + 1]]);
    idx += 2;
  }
  return pairs;
}

// POST /api/tournaments/:id/fixtures/generate — Organizer/Admin only
async function generateFixtures(req, res) {
  const { id } = req.params;

  try {
    const ownership = await verifyOrganizer(id, req.user.id, req.user.role);
    if (!ownership.ok) {
      return res.status(ownership.reason === "not_found" ? 404 : 403)
        .json({ error: ownership.reason === "not_found" ? "Tournament not found" : "You are not the organizer" });
    }

    const existingFixtures = await pool.query("SELECT id FROM fixtures WHERE tournament_id = $1", [id]);
    if (existingFixtures.rows.length > 0) {
      return res.status(409).json({ error: "Fixtures already generated for this tournament" });
    }

    const teamsResult = await pool.query(
      "SELECT team_id FROM tournament_registrations WHERE tournament_id = $1 AND status = 'registered'",
      [id]
    );
    const teamIds = shuffle(teamsResult.rows.map((r) => r.team_id));

    if (teamIds.length < 2) {
      return res.status(400).json({ error: "Need at least 2 registered teams to generate fixtures" });
    }

    const format = ownership.tournament.format;
    let created = 0;

    if (format === "round_robin" || format === "league") {
      const rounds = generateRoundRobinPairs(teamIds);
      for (let r = 0; r < rounds.length; r++) {
        for (const [team1, team2] of rounds[r]) {
          await pool.query(
            `INSERT INTO fixtures (tournament_id, team1_id, team2_id, round_number, status)
             VALUES ($1, $2, $3, $4, 'scheduled')`,
            [id, team1, team2, r + 1]
          );
          created++;
        }
      }
    } else if (format === "knockout") {
      const round1Pairs = generateKnockoutRound1(teamIds);
      for (const [team1, team2] of round1Pairs) {
        const status = team2 === null ? "completed" : "scheduled"; // a bye is auto-completed
        const fixtureResult = await pool.query(
          `INSERT INTO fixtures (tournament_id, team1_id, team2_id, round_number, status)
           VALUES ($1, $2, $3, 1, $4) RETURNING id`,
          [id, team1, team2, status]
        );
        created++;
        if (team2 === null) {
          // Auto-record the bye as a win for team1 so round-2 generation can find the winner
          await pool.query(
            `INSERT INTO match_results (fixture_id, team1_score, team2_score, winner_id)
             VALUES ($1, 0, 0, $2)`,
            [fixtureResult.rows[0].id, team1]
          );
        }
      }
    }

    await pool.query("UPDATE tournaments SET status = 'ongoing' WHERE id = $1", [id]);

    return res.status(201).json({ message: `${created} fixture(s) generated`, format });
  } catch (err) {
    console.error("Generate fixtures error:", err.message);
    return res.status(500).json({ error: "Failed to generate fixtures" });
  }
}

// POST /api/tournaments/:id/fixtures/next-round — Knockout only: builds next round from previous winners
async function advanceKnockoutRound(req, res) {
  const { id } = req.params;

  try {
    const ownership = await verifyOrganizer(id, req.user.id, req.user.role);
    if (!ownership.ok) {
      return res.status(ownership.reason === "not_found" ? 404 : 403)
        .json({ error: ownership.reason === "not_found" ? "Tournament not found" : "You are not the organizer" });
    }
    if (ownership.tournament.format !== "knockout") {
      return res.status(400).json({ error: "This action only applies to knockout tournaments" });
    }

    const maxRoundResult = await pool.query(
      "SELECT MAX(round_number) AS max_round FROM fixtures WHERE tournament_id = $1",
      [id]
    );
    const currentRound = maxRoundResult.rows[0].max_round;
    if (!currentRound) return res.status(400).json({ error: "No fixtures exist yet — generate round 1 first" });

    const fixturesResult = await pool.query(
      `SELECT f.*, mr.winner_id FROM fixtures f
       LEFT JOIN match_results mr ON mr.fixture_id = f.id
       WHERE f.tournament_id = $1 AND f.round_number = $2`,
      [id, currentRound]
    );

    const unfinished = fixturesResult.rows.filter((f) => !f.winner_id);
    if (unfinished.length > 0) {
      return res.status(400).json({ error: `${unfinished.length} match(es) in round ${currentRound} still need results` });
    }

    const winners = fixturesResult.rows.map((f) => f.winner_id);

    if (winners.length === 1) {
      await pool.query("UPDATE tournaments SET status = 'completed' WHERE id = $1", [id]);
      return res.json({ message: "Tournament complete", champion_team_id: winners[0] });
    }

    const nextRoundPairs = generateKnockoutRound1(winners); // reuse same bye logic for uneven winner counts
    let created = 0;
    for (const [team1, team2] of nextRoundPairs) {
      const status = team2 === null ? "completed" : "scheduled";
      const fixtureResult = await pool.query(
        `INSERT INTO fixtures (tournament_id, team1_id, team2_id, round_number, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [id, team1, team2, currentRound + 1, status]
      );
      created++;
      if (team2 === null) {
        await pool.query(
          `INSERT INTO match_results (fixture_id, team1_score, team2_score, winner_id) VALUES ($1, 0, 0, $2)`,
          [fixtureResult.rows[0].id, team1]
        );
      }
    }

    return res.status(201).json({ message: `Round ${currentRound + 1} generated with ${created} fixture(s)` });
  } catch (err) {
    console.error("Advance knockout round error:", err.message);
    return res.status(500).json({ error: "Failed to advance to next round" });
  }
}

// GET /api/tournaments/:id/fixtures — public
async function getFixtures(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT f.*, t1.name AS team1_name, t2.name AS team2_name,
              mr.team1_score, mr.team2_score, mr.winner_id
       FROM fixtures f
       LEFT JOIN teams t1 ON f.team1_id = t1.id
       LEFT JOIN teams t2 ON f.team2_id = t2.id
       LEFT JOIN match_results mr ON mr.fixture_id = f.id
       WHERE f.tournament_id = $1
       ORDER BY f.round_number, f.id`,
      [id]
    );
    return res.json({ fixtures: result.rows });
  } catch (err) {
    console.error("Get fixtures error:", err.message);
    return res.status(500).json({ error: "Failed to fetch fixtures" });
  }
}

module.exports = { generateFixtures, advanceKnockoutRound, getFixtures };