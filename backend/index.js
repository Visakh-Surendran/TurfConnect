const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { pool } = require("./src/config/db");
const authRoutes = require("./src/routes/authRoutes");
const slotRoutes = require("./src/routes/slotRoutes");
const bookingRoutes = require("./src/routes/bookingRoutes");
const turfRoutes = require("./src/routes/turfRoutes");
const teamRoutes = require("./src/routes/teamRoutes");
const tournamentRoutes = require("./src/routes/tournamentRoutes");
const fixtureRoutes = require("./src/routes/fixtureRoutes");
const playerRoutes = require("./src/routes/playerRoutes");
const playerRequestRoutes = require("./src/routes/playerRequestRoutes");
const ratingRoutes = require("./src/routes/ratingRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const reportRoutes = require("./src/routes/reportRoutes");

const app = express();
app.use(cors());
app.use(express.json());




app.get("/", (req, res) => {
  res.send("TurfConnect backend is running");
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use("/api/auth", authRoutes);

app.use("/api/turfs", turfRoutes);
app.use("/api/bookings", bookingRoutes);

app.use("/api/slots", slotRoutes);

app.use("/api/teams", teamRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/fixtures", fixtureRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/player-requests", playerRequestRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports", reportRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`  );
});