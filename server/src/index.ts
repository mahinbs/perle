import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import discoverRouter from './routes/discover.js';
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import libraryRouter from './routes/library.js';
import paymentRouter from './routes/payment.js';
import adminRouter from './routes/admin.js';
import chatRouter from './routes/chat.js';
import mediaRouter from './routes/media.js';
import { errorHandler } from './utils/errorHandler.js';
import { cleanupExpiredSessions } from './utils/auth.js';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3333;

// Allow multiple origins for CORS (development + production)
const allowedOrigins = [
  process.env.CORS_ORIGIN // Add custom origin from env if provided
].filter(Boolean); // Remove undefined values

app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log for debugging
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for development (you can change to false in production)
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'perle-backend', version: '1.0.0', port: PORT });
});

// API routes
app.use('/api', searchRouter);
app.use('/api', discoverRouter);
app.use('/api', authRouter);
app.use('/api', profileRouter);
app.use('/api', libraryRouter);
app.use('/api', paymentRouter);
app.use('/api', adminRouter);
app.use('/api', chatRouter);
app.use('/api/media', mediaRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Cleanup expired sessions every hour
setInterval(async () => {
  try {
    await cleanupExpiredSessions();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60 * 60 * 1000); // 1 hour

// Self-ping health check to keep Render alive (pings every 30 seconds)
// Render free tier spins down after 50 seconds of inactivity
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
if (RENDER_URL) {
  const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  
  const pingSelf = async () => {
    try {
      const healthUrl = `${RENDER_URL}/api/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-cache',
      });
      
      if (response.ok) {
        console.log('✅ Self-ping successful - keeping server alive');
      } else {
        console.warn(`⚠️ Self-ping failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Self-ping error:', error instanceof Error ? error.message : error);
    }
  };

  // Start self-pinging after server starts
  setTimeout(() => {
    // Ping immediately
    pingSelf();
    // Then ping every 30 seconds
    setInterval(pingSelf, HEALTH_CHECK_INTERVAL);
    console.log(`🔄 Health check: Self-pinging every ${HEALTH_CHECK_INTERVAL / 1000}s to keep Render alive`);
  }, 5000); // Wait 5 seconds after server starts
} else {
  console.log('ℹ️ Health check: RENDER_EXTERNAL_URL not set, skipping self-ping (likely local development)');
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 SyntraIQ backend listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`📡 CORS enabled for: ${allowedOrigins.join(', ')}`);
});

