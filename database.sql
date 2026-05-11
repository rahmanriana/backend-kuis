-- Create database
CREATE DATABASE IF NOT EXISTS tictactoe_realtime;
USE tictactoe_realtime;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  online_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_code VARCHAR(10) UNIQUE NOT NULL,
  player1_id INT,
  player2_id INT,
  status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_code VARCHAR(10) NOT NULL,
  sender_username VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_code (room_code)
);

-- Sample data (optional)
INSERT INTO users (username, password, online_status) VALUES
('admin', '$2a$10$example.hash.here', FALSE),
('player1', '$2a$10$example.hash.here', FALSE),
('player2', '$2a$10$example.hash.here', FALSE);