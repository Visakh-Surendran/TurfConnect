// One-off script to create the first admin account.
// Run manually with: node src/db/createAdmin.js
// Not part of the running app — never expose this as an API route.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

async function createAdmin() {
  const name = "Admin";
  const email = "visakhspo@gmail.com"; //admin@turfconnect.com
  const plainPassword = "Visakh@2489"; // ChangeThisPassword123

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      console.log("An account with this email already exists.");
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, name, email, role`,
      [name, email, passwordHash]
    );

    console.log("Admin created successfully:", result.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error("Failed to create admin:", err.message);
    process.exit(1);
  }
}

createAdmin();