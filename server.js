const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = require('./src/app');
const { setupSocketHandlers } = require('./socket/socketHandler');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"]
  }
});

// Setup Socket.IO event handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export io for potential use in other modules
module.exports = { io };