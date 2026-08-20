require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const generateRoutes = require('./routes/generate');
const historyRoutes = require('./routes/history');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  })
);

// Payme/Click webhooks may send different content-types – keep raw parsers limited
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Juda ko\'p so\'rov. Biroz kuting.' },
});
app.use('/api/', apiLimiter);

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Generatsiya limiti. 1 daqiqada maksimal 5 ta.' },
});
app.use('/api/generate', generateLimiter);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------
// Routes
// ---------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/payment', paymentRoutes);

// Health check for Railway
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: process.env.API_PROVIDER || 'mock',
    time: new Date().toISOString(),
  });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: 'Fayl yuklash xatosi: ' + err.message });
  }
  res.status(500).json({ error: err.message || 'Server xatosi' });
});

// ---------------------------------------------------------------
// Start
// ---------------------------------------------------------------
async function start() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai-video-generator';
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('   Continuing without DB – some features will fail.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`   AI Provider: ${process.env.API_PROVIDER || 'mock'}`);
    console.log(`   Env: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();
