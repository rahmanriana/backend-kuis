const express = require('express');
const cors = require('cors');
const authRoutes = require('../routes/authRoutes');

const app = express();

// Parse and clean the CLIENT_URL to prevent ERR_INVALID_CHAR crashes
const rawClientUrl = process.env.CLIENT_URL || '';
const allowedOrigins = rawClientUrl
  .split(',')
  .map(url => url.trim())
  .filter(url => url.length > 0);

console.log('=== CORS CONFIG ===');
console.log('Raw CLIENT_URL:', JSON.stringify(rawClientUrl));
console.log('Parsed origins:', allowedOrigins);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    // If no specific origins configured, allow all
    if (allowedOrigins.length === 0) {
      return callback(null, true);
    }
    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    // For development, allow localhost origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, origin);
    }
    // Allow all vercel.app origins for preview deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, origin);
    }
    console.log('CORS blocked origin:', origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

// Routes
app.use('/api', authRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Tic-Tac-Toe Quiz Backend API',
    version: '1.0.0',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.message, err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;