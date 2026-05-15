const mysql = require('mysql2/promise');

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PORT'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    // Keep running for non-DB gameplay; log a clear warning.
    console.warn(`[DB] Missing env ${key}. Auth/online/chat features may not work.`);
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  queueLimit: 0,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined
});

async function dbQuery(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  dbQuery
};
