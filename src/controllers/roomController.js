const { Room } = require('../models/Room');
const { generateCode } = require('../utils/generateCode');

// In-memory storage for rooms
const rooms = new Map();

/**
 * Create a new room
 * @param {string} theme - Game theme
 * @param {string} hostSocketId - Host's socket ID
 * @param {string} hostName - Host's name
 * @returns {object} - {roomCode, room}
 */
function createRoom(theme, hostSocketId, hostName) {
  try {
    // Generate unique room code
    let roomCode;
    let attempts = 0;
    do {
      roomCode = generateCode();
      attempts++;
      if (attempts > 100) {
        throw new Error('Unable to generate unique room code');
      }
    } while (rooms.has(roomCode));

    // Create room
    const room = new Room(roomCode, theme, hostSocketId);

    // Add host as first player
    const success = room.addPlayer(hostSocketId, hostName);
    if (!success) {
      throw new Error('Failed to add host to room');
    }

    // Store room
    rooms.set(roomCode, room);

    console.log(`Room ${roomCode} created by ${hostName} with theme ${theme}`);
    return { roomCode, room };
  } catch (error) {
    console.error('Error creating room:', error);
    throw error;
  }
}

/**
 * Join an existing room
 * @param {string} roomCode - Room code to join
 * @param {string} socketId - Player's socket ID
 * @param {string} playerName - Player's name
 * @returns {object} - {success, room/message}
 */
function joinRoom(roomCode, socketId, playerName) {
  try {
    const room = rooms.get(roomCode);

    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.isFull()) {
      return { success: false, message: 'Room is full' };
    }

    if (room.status !== 'waiting') {
      return { success: false, message: 'Game already started' };
    }

    // Check if player is already in room
    if (room.getPlayer(socketId)) {
      return { success: false, message: 'Player already in room' };
    }

    // Add player
    const success = room.addPlayer(socketId, playerName);
    if (!success) {
      return { success: false, message: 'Failed to join room' };
    }

    console.log(`Player ${playerName} joined room ${roomCode}`);
    return { success: true, room };
  } catch (error) {
    console.error('Error joining room:', error);
    return { success: false, message: 'Internal server error' };
  }
}

/**
 * Remove player from room
 * @param {string} roomCode - Room code
 * @param {string} socketId - Player's socket ID
 * @returns {object|null} - Removed player or null
 */
function leaveRoom(roomCode, socketId) {
  try {
    const room = rooms.get(roomCode);
    if (!room) {
      return null;
    }

    const removedPlayer = room.removePlayer(socketId);

    // Delete room if empty
    if (room.getPlayerCount() === 0) {
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted (empty)`);
    }

    return removedPlayer;
  } catch (error) {
    console.error('Error leaving room:', error);
    return null;
  }
}

/**
 * Get room by code
 * @param {string} roomCode - Room code
 * @returns {object|null} - Room instance or null
 */
function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

/**
 * Delete room
 * @param {string} roomCode - Room code to delete
 */
function deleteRoom(roomCode) {
  rooms.delete(roomCode);
  console.log(`Room ${roomCode} deleted`);
}

/**
 * Get list of waiting rooms
 * @returns {array} - Array of waiting rooms
 */
function getRoomsList() {
  const waitingRooms = [];
  for (const [code, room] of rooms) {
    // Only show rooms that have 2 players (full and ready to play)
    // Don't show rooms that are being created or have only 1 player
    if (room.status === 'waiting' && room.isFull()) {
      waitingRooms.push({
        roomCode: code,
        theme: room.theme,
        host: room.players[0]?.name || 'Unknown',
        playerCount: room.getPlayerCount(),
        maxPlayers: room.maxPlayers
      });
    }
  }
  return waitingRooms;
}

/**
 * Get all rooms (debug)
 * @returns {Map} - All rooms
 */
function getAllRooms() {
  return rooms;
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  deleteRoom,
  getRoomsList,
  getAllRooms
};