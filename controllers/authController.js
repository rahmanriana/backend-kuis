const bcrypt = require('bcryptjs');
const { pool } = require('../db');

function jsonError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function register(req, res, next) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return jsonError(res, 400, 'Username and password are required');
    }

    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 3) {
      return jsonError(res, 400, 'Username minimum 3 characters');
    }
    if (String(password).length < 6) {
      return jsonError(res, 400, 'Password minimum 6 characters');
    }

    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [cleanUsername]);
    if (existing.length > 0) {
      return jsonError(res, 409, 'Username already used');
    }

    const hashed = await bcrypt.hash(String(password), 10);

    const [result] = await pool.execute(
      'INSERT INTO users (username, password, online_status) VALUES (?, ?, ?)',
      [cleanUsername, hashed, false]
    );

    return res.status(201).json({
      success: true,
      message: 'Register success',
      user: {
        id: result.insertId,
        username: cleanUsername,
        online_status: false
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return jsonError(res, 400, 'Username and password are required');
    }

    const cleanUsername = String(username).trim();

    const [rows] = await pool.execute(
      'SELECT id, username, password, online_status FROM users WHERE username = ? LIMIT 1',
      [cleanUsername]
    );

    if (rows.length === 0) {
      return jsonError(res, 401, 'Invalid username or password');
    }

    const user = rows[0];
    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      return jsonError(res, 401, 'Invalid username or password');
    }

    await pool.execute('UPDATE users SET online_status = ? WHERE id = ?', [true, user.id]);

    return res.json({
      success: true,
      message: 'Login success',
      user: {
        id: user.id,
        username: user.username,
        online_status: true
      }
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login
};
