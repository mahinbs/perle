import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DiscoverItem } from '../types.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const data = require('../data/discover.json');

const router = Router();
const allItems: DiscoverItem[] = data as DiscoverItem[];

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  const mulberry32 = (s: number) => () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); return (t ^ t >>> 14) >>> 0; };
  const rng = mulberry32(h >>> 0);
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.get('/discover', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const shuffled = seededShuffle(allItems, today);
  res.json(shuffled);
});

router.get('/discover/:id', (req, res) => {
  const item = allItems.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Generate a full AI article for a discover topic using Gemini
router.post('/discover/article', async (req, res) => {
  const { title, description, category } = req.body as { title?: string; description?: string; category?: string };
  if (!title) return res.status(400).json({ error: 'title is required' });

  const apiKey = process.env.GOOGLE_API_KEY_FREE;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a knowledgeable expert writer for a Perplexity-style discovery app.
Generate a rich, detailed, well-structured article about the topic: "${title}"
Category: ${category || 'General'}
Brief context: ${description || ''}

Include 1-2 relevant emojis at the start of each section title (e.g. 💉💊 for health, 🏏🎾 for sports, 📊 for finance, 🔬 for science). Put emojis in the title strings.

Respond ONLY with valid JSON in exactly this format (no markdown, no code blocks):
{
  "overview": "2-3 sentence engaging introduction to the topic",
  "keyFacts": ["fact 1", "fact 2", "fact 3", "fact 4", "fact 5"],
  "sections": [
    { "title": "🔬 Section heading", "content": "2-3 sentences of detailed content" },
    { "title": "Section heading", "content": "2-3 sentences of detailed content" },
    { "title": "Section heading", "content": "2-3 sentences of detailed content" },
    { "title": "Section heading", "content": "2-3 sentences of detailed content" }
  ],
  "relatedTopics": ["related topic 1", "related topic 2", "related topic 3", "related topic 4", "related topic 5"],
  "readTime": "X min read"
}

Make the content genuinely educational, interesting, and accurate. Use current knowledge.`;

    const timeout = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Gemini timeout')), ms));
    const result = await Promise.race([
      model.generateContent(prompt),
      timeout(20000),
    ]) as Awaited<ReturnType<typeof model.generateContent>>;
    const text = result.response.text().trim();

    // Strip potential markdown fences
    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const article = JSON.parse(clean);
    res.json(article);
  } catch (err) {
    console.error('Discover article generation failed:', err);
    res.status(500).json({ error: 'Failed to generate article' });
  }
});

export default router;

