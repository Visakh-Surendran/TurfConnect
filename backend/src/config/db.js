const path = require("path");
const { Pool, types } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

types.setTypeParser(1082, (val) => val);


const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

pool.on("connect", () => {
  console.log("PostgreSQL pool: new client connected");
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error on idle client", err);
  process.exit(-1);
});


module.exports = { pool };