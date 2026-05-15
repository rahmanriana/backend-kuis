const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = require('./src/app');
const { setupSocketHandlers } = require('./socket/socketHandler');

// Parse and clean the CLIENT_URL for Socket.IO CORS
const rawClientUrl = process.env.CLIENT_URL || '';
const allowedOrigins = rawClientUrl
  .split(',')
  .map(url => url.trim())
  .filter(url => url.length > 0);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with robust CORS handling
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin
      if (!origin) {
        return callback(null, true);
      }
      // If no specific origins configured, allow all
      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }
      // Check allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }
      // Allow localhost for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, origin);
      }
      // Allow all vercel.app origins
      if (origin.endsWith('.vercel.app')) {
        return callback(null, origin);
      }
      return callback(null, false);
    },
    methods: ["GET", "POST"],
    credentials: true
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