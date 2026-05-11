const { pool } = require('../../db');

async function getOnlineUsers() {
  try {
    // NOTE: Keperluan UI dashboard: tampilkan online + offline realtime.
    // Tetap gunakan nama fungsi lama supaya tidak merusak pemanggilan existing.
    const [rows] = await pool.execute(
      'SELECT id, username, online_status FROM users ORDER BY online_status DESC, username',
      []
    );
    return rows;
  } catch (err) {
    console.error('Error getting online users:', err);
    return [];
  }
}

async function setUserOnline(userId, online) {
  try {
    await pool.execute('UPDATE users SET online_status = ? WHERE id = ?', [online, userId]);
  } catch (err) {
    console.error('Error updating user online status:', err);
  }
}

async function getUserById(userId) {
  try {
    const [rows] = await pool.execute('SELECT id, username FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
  } catch (err) {
    console.error('Error getting user by ID:', err);
    return null;
  }
}

async function saveMessage(roomCode, senderUsername, message) {
  try {
    await pool.execute(
      'INSERT INTO messages (room_code, sender_username, message) VALUES (?, ?, ?)',
      [roomCode, senderUsername, message]
    );
  } catch (err) {
    console.error('Error saving message:', err);
  }
}

async function getRoomMessages(roomCode, limit = 50) {
  try {
    const [rows] = await pool.execute(
      'SELECT sender_username, message, created_at FROM messages WHERE room_code = ? ORDER BY created_at DESC LIMIT ?',
      [roomCode, limit]
    );
    return rows.reverse(); // Return in chronological order
  } catch (err) {
    console.error('Error getting room messages:', err);
    return [];
  }
}

module.exports = {
  getOnlineUsers,
  setUserOnline,
  getUserById,
  saveMessage,
  getRoomMessages
};
