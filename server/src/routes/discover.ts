import { Router } from 'express';
import type { DiscoverItem } from '../types.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Load JSON without import assertions for TS compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const data = require('../data/discover.json');

const router = Router();
const items: DiscoverItem[] = data as DiscoverItem[];

router.get('/discover', (_req, res) => {
  res.json(items);
});

router.get('/discover/:id', (req, res) => {
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

export default router;

