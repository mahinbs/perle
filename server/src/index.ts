import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import discoverRouter from './routes/discover.js';
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import libraryRouter from './routes/library.js';
import { errorHandler } from './utils/errorHandler.js';
import { cleanupExpiredSessions } from './utils/auth.js';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3333;
const ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: ORIGIN }));
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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 SyntraIQ backend listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`📡 CORS enabled for: ${ORIGIN}`);
});

