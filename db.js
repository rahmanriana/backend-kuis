const mysql = require('mysql2/promise');

// Support both custom env names (DB_*) and Railway MySQL plugin env names (MYSQL_*)
const dbConfig = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'tictactoe_realtime',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306),
};

console.log('=== DB CONFIG ===');
console.log('Host:', dbConfig.host);
console.log('User:', dbConfig.user);
console.log('Database:', dbConfig.database);
console.log('Port:', dbConfig.port);
console.log('Has password:', !!dbConfig.password);

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  queueLimit: 0,
  // Railway MySQL requires SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('=== DB CONNECTED SUCCESSFULLY ===');
    conn.release();
  })
  .catch(err => {
    console.error('=== DB CONNECTION FAILED ===', err.message);
  });

async function dbQuery(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  dbQuery
};
