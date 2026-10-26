const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, "migrate_refunds.sql"), "utf-8");
  console.log("Applying migration...");
  await pool.query(sql);
  console.log("Migration applied successfully!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
