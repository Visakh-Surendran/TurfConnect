const { pool } = require("../config/db");

// POST /api/turfs — Owner only (UPDATED: no more sport/price fields)
async function createTurf(req, res) {
  const { name, location, amenities, photo_url } = req.body;
  const owner_id = req.user.id;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO turfs (owner_id, name, location, amenities, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [owner_id, name, location || null, amenities || null, photo_url || null]
    );
    const turf = result.rows[0];

    // Auto-seed standard sports for the newly created turf so it's immediately ready for booking
    await pool.query(
      `INSERT INTO turf_sports (turf_id, sport_type, price_per_hour, peak_price)
       VALUES 
         ($1, 'Football', 800, 1000),
         ($1, 'Cricket', 900, 1200),
         ($1, 'Badminton', 600, 800)
       ON CONFLICT (turf_id, sport_type) DO NOTHING`,
      [turf.id]
    );

    return res.status(201).json({ turf });
  } catch (err) {
    console.error("Create turf error:", err.message);
    return res.status(500).json({ error: "Failed to create turf" });
  }
}

// GET /api/turfs — Public search (UPDATED: joins turf_sports for pricing/sport info)
async function getAllTurfs(req, res) {
  const { location, sport_type } = req.query;

  try {
    let query = `
      SELECT t.*,
        COALESCE(json_agg(DISTINCT ts.sport_type) FILTER (WHERE ts.sport_type IS NOT NULL), '[]') AS sports,
        MIN(ts.price_per_hour) AS starting_price
      FROM turfs t
      LEFT JOIN turf_sports ts ON ts.turf_id = t.id
      WHERE t.status = 'approved'
    `;
    const params = [];

    if (location) {
      params.push(`%${location}%`);
      query += ` AND t.location ILIKE $${params.length}`;
    }
    query += " GROUP BY t.id";

    if (sport_type) {
      params.push(sport_type);
      query += ` HAVING $${params.length} = ANY(array_agg(ts.sport_type))`;
    }
    query += " ORDER BY t.created_at DESC";

    const result = await pool.query(query, params);
    return res.json({ turfs: result.rows });
  } catch (err) {
    console.error("Get turfs error:", err.message);
    return res.status(500).json({ error: "Failed to fetch turfs" });
  }
}


async function getMyTurfs(req, res) {
  try {
    const result = await pool.query(
      "SELECT * FROM turfs WHERE owner_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({ turfs: result.rows });
  } catch (err) {
    console.error("Get my turfs error:", err.message);
    return res.status(500).json({ error: "Failed to fetch your turfs" });
  }
}


async function getPendingTurfs(req, res) {
  try {
    const result = await pool.query(
      "SELECT * FROM turfs WHERE status = 'pending' ORDER BY created_at ASC"
    );
    return res.json({ turfs: result.rows });
  } catch (err) {
    console.error("Get pending turfs error:", err.message);
    return res.status(500).json({ error: "Failed to fetch pending turfs" });
  }
}

async function updateTurfStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }

  try {
    const result = await pool.query(
      "UPDATE turfs SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Turf not found" });
    }
    return res.json({ turf: result.rows[0] });
  } catch (err) {
    console.error("Update turf status error:", err.message);
    return res.status(500).json({ error: "Failed to update turf status" });
  }
}
// GET /api/turfs/:id — Public (UPDATED: includes nested sports array)
async function getTurfById(req, res) {
  const { id } = req.params;
  try {
    const turfResult = await pool.query("SELECT * FROM turfs WHERE id = $1", [id]);
    if (turfResult.rows.length === 0) {
      return res.status(404).json({ error: "Turf not found" });
    }
    let sportsResult = await pool.query(
      "SELECT id, turf_id, TRIM(sport_type) AS sport_type, price_per_hour, peak_price FROM turf_sports WHERE turf_id = $1 ORDER BY id",
      [id]
    );

    // Auto-seed standard sports if none exist yet for this turf
    if (sportsResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO turf_sports (turf_id, sport_type, price_per_hour, peak_price)
         VALUES 
           ($1, 'Football', 800, 1000),
           ($1, 'Cricket', 900, 1200),
           ($1, 'Badminton', 600, 800)
         ON CONFLICT (turf_id, sport_type) DO NOTHING`,
        [id]
      );
      sportsResult = await pool.query(
        "SELECT id, turf_id, TRIM(sport_type) AS sport_type, price_per_hour, peak_price FROM turf_sports WHERE turf_id = $1 ORDER BY id",
        [id]
      );
    }

    return res.json({ turf: { ...turfResult.rows[0], sports: sportsResult.rows } });
  } catch (err) {
    console.error("Get turf error:", err.message);
    return res.status(500).json({ error: "Failed to fetch turf" });
  }
}

// PUT /api/turfs/:id — Owner only, must own this turf
async function updateTurf(req, res) {
  const { id } = req.params;
  const { name, location, sport_type, amenities, price_per_hour, peak_price, photo_url } = req.body;

  try {
    const existing = await pool.query("SELECT owner_id FROM turfs WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Turf not found" });
    }
    if (existing.rows[0].owner_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not own this turf" });
    }

    const result = await pool.query(
      `UPDATE turfs SET
         name = COALESCE($1, name),
         location = COALESCE($2, location),
         sport_type = COALESCE($3, sport_type),
         amenities = COALESCE($4, amenities),
         price_per_hour = COALESCE($5, price_per_hour),
         peak_price = COALESCE($6, peak_price),
         photo_url = COALESCE($7, photo_url)
       WHERE id = $8
       RETURNING *`,
      [name, location, sport_type, amenities, price_per_hour, peak_price, photo_url, id]
    );
    return res.json({ turf: result.rows[0] });
  } catch (err) {
    console.error("Update turf error:", err.message);
    return res.status(500).json({ error: "Failed to update turf" });
  }
}

module.exports = {
  createTurf, getAllTurfs, getTurfById, updateTurf,
  getMyTurfs, getPendingTurfs, updateTurfStatus,
};