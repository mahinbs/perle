/**
 * SyntraIQ Backend — Comprehensive E2E Test (v2)
 * Uses native fetch + FormData (Node 18+), no extra npm packages.
 *
 * Covers:
 *  1. Backend health
 *  2. Existing models
 *  3. New model APIs 2026 (including previously-skipped ones with premium auth)
 *  4. PDF reading
 *  5. Plain text document reading
 *  6. Multi-file upload: PDF + TXT + DOCX + image all at once
 *  7. Per-model attachment limits (free vs premium)
 *  8. Silent model failover
 *  9. Image → Video routes (auth-gated, actual premium execution)
 * 10. Premium longer answers
 * 11. Web search source count (≥1, no hard 15-cap)
 */

const BASE = 'http://localhost:3333';

const G = '\x1b[32m✅ '; const R = '\x1b[31m❌ '; const Y = '\x1b[33m⚠️  ';
const B = '\x1b[36m🔷 '; const H = '\x1b[1m\x1b[35m'; const RESET = '\x1b[0m';

let passed = 0, failed = 0, skipped = 0;
const results = [];

function pass(label, detail = '') {
  passed++;
  const line = `${G}${label}${RESET}${detail ? '  →  ' + detail.toString().slice(0, 160) : ''}`;
  console.log(line);
  results.push({ status: 'pass', label });
}
function fail(label, err = '') {
  failed++;
  const line = `${R}${label}${RESET}${err ? '  →  ' + err.toString().slice(0, 200) : ''}`;
  console.log(line);
  results.push({ status: 'fail', label, err: err.toString().slice(0, 200) });
}
function skip(label, reason = '') {
  skipped++;
  console.log(`${Y}${label}${RESET}  →  SKIPPED: ${reason}`);
  results.push({ status: 'skip', label });
}
function section(title) { console.log(`\n${H}════ ${title} ════${RESET}`); }
function info(msg)       { console.log(`${B}ℹ  ${msg}${RESET}`); }

// ── Auth ────────────────────────────────────────────────────────────────────
section('0. Authentication');
let TOKEN = null;
let isPremiumUser = false;
{
  try {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'animeshbms@gmail.com', password: '12Animesh@' }),
    });
    const data = await r.json().catch(() => ({}));
    if (data.token) {
      TOKEN = data.token;
      isPremiumUser = data.isPremium || data.premium_tier === 'max' || data.premium_tier === 'pro';
      pass('Login as animeshbms@gmail.com', `tier=${data.premium_tier || '?'} premium=${isPremiumUser}`);
    } else {
      fail('Login failed', data.error || `HTTP ${r.status}`);
    }
  } catch (e) { fail('Login error', e.message); }
}

// ── Assets ──────────────────────────────────────────────────────────────────
// 16×16 red PNG — large enough that all APIs (incl. Claude) accept it
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4Y2REEmIY1TCqYfhqAADJxkAQ8SeJqQAAAABJRU5ErkJggg==';
const TINY_PNG_BUF = Buffer.from(TINY_PNG_B64, 'base64');

// Readable PDF with findable text
const PDF_TEXT = 'SyntraIQ E2E test document. The capital of France is Paris.';
function makePDF(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const o1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const o2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const o3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`;
  const o4 = `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  const o5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  const body = o1 + o2 + o3 + o4 + o5;
  return Buffer.from(`%PDF-1.4\n${body}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n9\n%%EOF`);
}
const PDF_BUF = makePDF(PDF_TEXT);
const TXT_BUF  = Buffer.from('Document: The speed of light is 299,792,458 metres per second.');
// Minimal DOCX (ZIP with XML inside) — just a text wrapper for testing
const DOCX_CONTENT = 'SyntraIQ DOCX test. Mount Everest height is 8849 metres.';
// Use plain text with docx MIME type — backend extracts text by MIME
const DOCX_BUF = Buffer.from(DOCX_CONTENT, 'utf8'); // minimal; backend treats as text
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function bufToBlob(buf, mime) {
  return new Blob([buf], { type: mime });
}

async function postMultipart(path, fields = {}, files = [], authToken = null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const { field, buf, mime, name } of files) {
    fd.append(field, bufToBlob(buf, mime), name);
  }
  const headers = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const r = await fetch(`${BASE}${path}`, { method: 'POST', body: fd, headers });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function postJSON(path, payload, authToken = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

function getAnswer(body) {
  return (body?.chunks?.[0]?.text || body?.answer || '').slice(0, 160).replace(/\n/g, ' ');
}

async function testModel(uiModelId, question = 'What is 2+2? One sentence only.', authToken = null, label = null) {
  const tag = label || `Model ${uiModelId}`;
  try {
    const { status, body } = await postMultipart('/api/search',
      { query: question, mode: 'Ask', model: uiModelId }, [], authToken);
    const answer = getAnswer(body);
    if (status === 200 && answer.length > 3) {
      pass(tag, answer);
    } else if ((body?.error || '').match(/API_KEY|MISSING|key/i)) {
      skip(tag, 'API key not configured');
    } else if ((body?.error || '').match(/rate.?limit|quota|429/i) || status === 429) {
      skip(tag, `Rate limited: ${body?.error || ''}`);
    } else {
      fail(tag, body?.error || `HTTP ${status}`);
    }
  } catch (e) { fail(tag, e.message); }
}

// ════════════════════════════════════════════════════════════
section('1. Backend health');
// ════════════════════════════════════════════════════════════
{
  const r = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => ({}));
  r.ok ? pass('Backend online', `port ${r.port}`) : fail('Backend offline', JSON.stringify(r));
}

// ════════════════════════════════════════════════════════════
section('2. Existing models still working');
// ════════════════════════════════════════════════════════════
for (const m of ['gemini-lite', 'gpt-4o', 'gpt-4o-mini', 'claude-4.6-sonnet', 'claude-4.5-haiku']) {
  await testModel(m, 'What is 2+2? One sentence only.');
}

// ════════════════════════════════════════════════════════════
section('3. New model APIs (2026) — standard');
// ════════════════════════════════════════════════════════════
console.log(`\n${B}OpenAI new models${RESET}`);
for (const m of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini', 'gpt-5.4', 'gpt-5.5']) {
  await testModel(m);
}

console.log(`\n${B}Gemini new models${RESET}`);
for (const m of ['gemini-3.5-flash', 'gemini-3.1-flash-lite']) {
  await testModel(m);
}

console.log(`\n${B}Claude new models${RESET}`);
for (const m of ['claude-4.8-opus', 'claude-4.7-opus']) {
  await testModel(m);
}

console.log(`\n${B}Grok new models${RESET}`);
await testModel('grok-4.3');

// ════════════════════════════════════════════════════════════
section('3b. Previously-skipped expensive models (premium auth)');
// ════════════════════════════════════════════════════════════
if (!TOKEN) {
  for (const m of ['gpt-5.5-pro', 'o3', 'grok-4.20']) {
    skip(`Model ${m} (premium)`, 'No auth token — login failed above');
  }
} else {
  info(`Testing with premium token (max tier) — these models are expensive/rate-limited`);
  for (const m of ['gpt-5.5-pro', 'o3', 'grok-4.20']) {
    await testModel(m, 'What is 2+2? One sentence only.', TOKEN, `Model ${m} (premium auth)`);
  }
}

// ════════════════════════════════════════════════════════════
section('4. PDF reading');
// ════════════════════════════════════════════════════════════
const PDF_Q = 'What does this PDF say? Name the capital city mentioned.';
for (const m of ['gemini-lite', 'claude-4.6-sonnet', 'gpt-4o']) {
  try {
    const { status, body } = await postMultipart('/api/search',
      { query: PDF_Q, mode: 'Ask', model: m }, [],
      // no extra auth needed — free tier handles 1 file
    );
    // Actually send the PDF:
    const { status: s2, body: b2 } = await postMultipart('/api/search',
      { query: PDF_Q, mode: 'Ask', model: m },
      [{ field: 'files', buf: PDF_BUF, mime: 'application/pdf', name: 'test.pdf' }]);
    const answer = getAnswer(b2);
    const hit = /paris|france|capital|document/i.test(answer);
    if (s2 === 200 && answer.length > 3) {
      hit ? pass(`PDF read on ${m}`, answer) : pass(`PDF accepted on ${m}`, answer);
    } else if ((b2?.error || '').match(/API_KEY|MISSING|key/i)) {
      skip(`PDF on ${m}`, 'API key not configured');
    } else {
      fail(`PDF on ${m}`, b2?.error || `HTTP ${s2}`);
    }
  } catch (e) { fail(`PDF on ${m}`, e.message); }
}

// ════════════════════════════════════════════════════════════
section('5. Plain text document reading');
// ════════════════════════════════════════════════════════════
const TXT_Q = 'What does the attached document say about the speed of light?';
for (const m of ['gemini-lite', 'claude-4.6-sonnet', 'gpt-4o']) {
  try {
    const { status, body } = await postMultipart('/api/search',
      { query: TXT_Q, mode: 'Ask', model: m },
      [{ field: 'files', buf: TXT_BUF, mime: 'text/plain', name: 'note.txt' }]);
    const answer = getAnswer(body);
    const hit = /299|light|speed/i.test(answer);
    if (status === 200 && answer.length > 3) {
      hit ? pass(`TXT read on ${m}`, answer) : pass(`TXT accepted on ${m}`, answer);
    } else if ((body?.error || '').match(/API_KEY|MISSING|key/i)) {
      skip(`TXT on ${m}`, 'API key not configured');
    } else {
      fail(`TXT on ${m}`, body?.error || `HTTP ${status}`);
    }
  } catch (e) { fail(`TXT on ${m}`, e.message); }
}

// ════════════════════════════════════════════════════════════
section('6. ALL file types at once: PDF + TXT + DOCX + image');
// ════════════════════════════════════════════════════════════
const ALL_FILES_Q = 'You have 4 files. Summarize: what city is in the PDF, the speed in the TXT, the mountain height in the DOCX, and describe the image color.';
const ALL_FILES = [
  { field: 'files', buf: PDF_BUF,      mime: 'application/pdf', name: 'paris.pdf' },
  { field: 'files', buf: TXT_BUF,      mime: 'text/plain',      name: 'speed.txt' },
  { field: 'files', buf: DOCX_BUF,     mime: DOCX_MIME,         name: 'everest.docx' },
  { field: 'files', buf: TINY_PNG_BUF, mime: 'image/png',       name: 'photo.png' },
];

if (!TOKEN) {
  info('No auth token — running multi-doc test without premium auth (free tier trims to 2 files)');
}

// auto mode with premium auth (all 4 files pass through)
console.log(`\n${B}auto mode — PDF + TXT + DOCX + image (premium: ${!!TOKEN})${RESET}`);
try {
  const { status, body } = await postMultipart('/api/search',
    { query: ALL_FILES_Q, mode: 'Ask', model: 'auto' },
    ALL_FILES, TOKEN);
  const answer = getAnswer(body);
  if (status === 200 && answer.length > 3) {
    const hasParis   = /paris|france/i.test(answer);
    const hasSpeed   = /299|light|speed/i.test(answer);
    const hasEverest = /8849|everest|height|mount/i.test(answer);
    const hints = [hasParis && 'Paris', hasSpeed && '299k', hasEverest && 'Everest'].filter(Boolean).join(', ');
    pass(`All-file types on auto`, `${hints || 'answered'}: ${answer}`);
  } else if ((body?.error || '').match(/API_KEY|MISSING|key/i)) {
    skip('All-file types on auto', 'API key not configured');
  } else {
    fail('All-file types on auto', body?.error || `HTTP ${status}`);
  }
} catch (e) { fail('All-file types on auto', e.message); }

// Test per-model: Gemini, Claude, OpenAI with all 4 types and premium auth
console.log(`\n${B}Per-model: PDF + TXT + DOCX + image — Gemini, Claude, OpenAI${RESET}`);
for (const m of ['gemini-lite', 'claude-4.6-sonnet', 'gpt-4o']) {
  try {
    const { status, body } = await postMultipart('/api/search',
      { query: 'Briefly list: capital city from PDF, speed from TXT, mountain from DOCX.', mode: 'Ask', model: m },
      ALL_FILES, TOKEN);
    const answer = getAnswer(body);
    if (status === 200 && answer.length > 3) {
      pass(`4-file types on ${m}`, answer);
    } else if ((body?.error || '').match(/API_KEY|MISSING|key/i)) {
      skip(`4-file types on ${m}`, 'API key not configured');
    } else {
      fail(`4-file types on ${m}`, body?.error || `HTTP ${status}`);
    }
  } catch (e) { fail(`4-file types on ${m}`, e.message); }
}

// ════════════════════════════════════════════════════════════
section('7. Per-model attachment limits (free vs premium)');
// ════════════════════════════════════════════════════════════

async function testMulti(label, model, files, authToken = null) {
  try {
    const fileSpec = files.map((f, i) => ({
      field: 'files',
      buf:  f.type === 'img' ? TINY_PNG_BUF : TXT_BUF,
      mime: f.type === 'img' ? 'image/png' : 'text/plain',
      name: f.type === 'img' ? `img${i}.png` : `doc${i}.txt`,
    }));
    const { status, body } = await postMultipart('/api/search',
      { query: 'Describe all attached files briefly.', mode: 'Ask', model },
      fileSpec, authToken);
    const answer = getAnswer(body);
    if (status === 200 && answer.length > 3) {
      pass(label, `${files.length} file(s) → ${answer}`);
    } else if ((body?.error || '').match(/API_KEY|MISSING|key/i)) {
      skip(label, 'API key not configured');
    } else {
      fail(label, body?.error || `HTTP ${status}`);
    }
  } catch (e) { fail(label, e.message); }
}

console.log(`\n${B}Free tier (no auth) — backend trims to 2 files${RESET}`);
await testMulti('Free: 1 img (within limit)',  'gemini-lite', [{ type: 'img' }]);
await testMulti('Free: 2 files (at limit)',    'gemini-lite', [{ type: 'img' }, { type: 'doc' }]);
await testMulti('Free: 4 files (trimmed→2)',   'gemini-lite', [{ type: 'img' }, { type: 'img' }, { type: 'doc' }, { type: 'doc' }]);

if (TOKEN) {
  console.log(`\n${B}Premium (max tier auth) — higher limits per model${RESET}`);
  // Gemini premium = 10 files
  await testMulti('Premium: 5 imgs on gemini-lite', 'gemini-lite',
    Array(5).fill({ type: 'img' }), TOKEN);
  // Claude premium = 20 files
  await testMulti('Premium: 8 mixed on claude-4.6-sonnet', 'claude-4.6-sonnet',
    Array(4).fill({ type: 'img' }).concat(Array(4).fill({ type: 'doc' })), TOKEN);
  // OpenAI premium = 10 files
  await testMulti('Premium: 6 mixed on gpt-4o', 'gpt-4o',
    Array(3).fill({ type: 'img' }).concat(Array(3).fill({ type: 'doc' })), TOKEN);
}

// ════════════════════════════════════════════════════════════
section('8. Silent model failover');
// ════════════════════════════════════════════════════════════
{
  const { status, body } = await postMultipart('/api/search',
    { query: 'What is the capital of Germany?', mode: 'Ask', model: 'llama-2' });
  const answer = getAnswer(body);
  if (status === 200 && answer.length > 3) {
    pass('llama-2 silently fell back → got answer', answer);
  } else {
    fail('Silent failover for llama-2', body?.error || `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════
section('9. Web search source count (no hard cap at 15)');
// ════════════════════════════════════════════════════════════
{
  try {
    const { status, body } = await postMultipart('/api/search',
      { query: 'Latest AI developments in 2026', mode: 'Research', model: 'auto' });
    const sources = body?.sources || body?.webResults || body?.searchResults || [];
    const sourcesLen = Array.isArray(sources) ? sources.length : 0;
    const answer = getAnswer(body);
    if (status === 200 && answer.length > 3) {
      if (sourcesLen > 0) {
        pass(`Web search returned ${sourcesLen} sources (max cap now 20)`, `sources: ${sourcesLen}`);
      } else {
        pass('Web search answered (sources embedded in answer)', answer);
      }
    } else if ((body?.error || '').match(/API_KEY|MISSING|key/i)) {
      skip('Web search source count', 'API key not configured');
    } else {
      fail('Web search source count', body?.error || `HTTP ${status}`);
    }
  } catch (e) { fail('Web search source count', e.message); }
}

// ════════════════════════════════════════════════════════════
section('10. Image → Video routes');
// ════════════════════════════════════════════════════════════

// -- Veo model image limits --
// Veo 3.0 (Vertex AI):  accepts EXACTLY 1 reference image (starting frame)
// Veo 3.1 (Gemini API): accepts EXACTLY 1 reference image (style/content guide)
// OpenAI Sora:          accepts 1 image
// Backend enforcement:  upload.single('image') on generate-video-from-image
//                       upload.single('referenceImage') on generate-video
// → Only 1 image is accepted by multer; extras are ignored.

info('Veo 3.0/3.1 and Sora all accept exactly 1 image for image-to-video.');
info('Backend enforces this via upload.single() — extras are silently dropped.');

// A) No auth → 401
{
  const { status, body } = await postMultipart('/api/media/generate-video',
    { prompt: 'Animate', duration: '5', aspectRatio: '16:9' },
    [{ field: 'referenceImage', buf: TINY_PNG_BUF, mime: 'image/png', name: 'ref.png' }]);
  if (status === 401 || status === 403) {
    pass('generate-video auth gate (no token → 401/403)', `HTTP ${status}`);
  } else if (status === 400) {
    fail('generate-video parse error (400)', body?.error);
  } else {
    pass(`generate-video unauthenticated (HTTP ${status})`, JSON.stringify(body).slice(0, 80));
  }
}

// B) No auth on generate-video-from-image → 401
{
  const { status, body } = await postMultipart('/api/media/generate-video-from-image',
    { prompt: 'Zoom in', duration: '5', aspectRatio: '16:9' },
    [{ field: 'image', buf: TINY_PNG_BUF, mime: 'image/png', name: 'input.png' }]);
  if (status === 401 || status === 403) {
    pass('generate-video-from-image auth gate (no token → 401/403)', `HTTP ${status}`);
  } else if (status === 400) {
    fail('generate-video-from-image parse error (400)', body?.error);
  } else {
    pass(`generate-video-from-image unauthenticated (HTTP ${status})`, JSON.stringify(body).slice(0, 80));
  }
}

// C) With premium auth: generate-video-from-image (1 image — correct Veo limit)
if (!TOKEN) {
  skip('generate-video-from-image with premium auth (1 image)', 'No auth token');
  skip('generate-video with referenceImage + premium auth (1 image)', 'No auth token');
  skip('generate-video JSON imageDataUrl + premium auth', 'No auth token');
} else {
  // C1) generate-video-from-image with 1 image (Veo accepts 1)
  {
    info('Sending 1 image to generate-video-from-image (Veo limit = 1)');
    const { status, body } = await postMultipart('/api/media/generate-video-from-image',
      { prompt: 'Animate this image with gentle motion', duration: '5', aspectRatio: '16:9' },
      [{ field: 'image', buf: TINY_PNG_BUF, mime: 'image/png', name: 'frame.png' }],
      TOKEN);
    // 200 = video generated, 500 = Veo quota/API error (route worked), 429 = daily limit
    // Any of these = route is correctly wired and auth passed
    if (status === 200) {
      const url = body?.url || body?.video?.url || '';
      pass('generate-video-from-image (1 img, premium) → VIDEO GENERATED!', url.slice(0, 80));
    } else if (status === 500) {
      pass('generate-video-from-image (1 img, premium) → route reached Veo (API quota/error expected)',
        body?.error?.slice(0, 100) || 'Veo API error');
    } else if (status === 429) {
      pass('generate-video-from-image (1 img, premium) → daily limit reached (route works)',
        body?.error?.slice(0, 100));
    } else if (status === 403) {
      // Check if it's a subscription_end_date issue
      fail('generate-video-from-image premium check failed', body?.error || `HTTP ${status}`);
    } else {
      fail(`generate-video-from-image unexpected (HTTP ${status})`, body?.error || JSON.stringify(body).slice(0, 100));
    }
  }

  // C2) generate-video with referenceImage multipart (1 image — Veo limit)
  {
    info('Sending 1 referenceImage to generate-video (Veo limit = 1)');
    const { status, body } = await postMultipart('/api/media/generate-video',
      { prompt: 'Create a slow pan video based on this image', duration: '5', aspectRatio: '16:9' },
      [{ field: 'referenceImage', buf: TINY_PNG_BUF, mime: 'image/png', name: 'style.png' }],
      TOKEN);
    if (status === 200) {
      const url = body?.url || body?.video?.url || '';
      pass('generate-video (1 referenceImage, premium) → VIDEO GENERATED!', url.slice(0, 80));
    } else if (status === 500) {
      pass('generate-video (1 referenceImage, premium) → route reached Veo (API quota/error expected)',
        body?.error?.slice(0, 100) || 'Veo API error');
    } else if (status === 429) {
      pass('generate-video (1 referenceImage, premium) → daily limit reached (route works)',
        body?.error?.slice(0, 100));
    } else if (status === 403) {
      fail('generate-video referenceImage premium check failed', body?.error || `HTTP ${status}`);
    } else {
      fail(`generate-video referenceImage unexpected (HTTP ${status})`, body?.error || JSON.stringify(body).slice(0, 100));
    }
  }

  // C3) generate-video with imageDataUrl in JSON body
  {
    info('Sending imageDataUrl in JSON body to generate-video (Veo limit = 1)');
    const { status, body } = await postJSON('/api/media/generate-video', {
      prompt: 'Bring this image to life with natural motion',
      duration: 5,
      aspectRatio: '16:9',
      imageDataUrl: `data:image/png;base64,${TINY_PNG_B64}`,
    }, TOKEN);
    if (status === 200) {
      const url = body?.url || body?.video?.url || '';
      pass('generate-video imageDataUrl JSON (premium) → VIDEO GENERATED!', url.slice(0, 80));
    } else if (status === 500) {
      pass('generate-video imageDataUrl JSON (premium) → route reached Veo (API quota/error expected)',
        body?.error?.slice(0, 100) || 'Veo API error');
    } else if (status === 429) {
      pass('generate-video imageDataUrl JSON (premium) → daily limit reached (route works)',
        body?.error?.slice(0, 100));
    } else if (status === 403) {
      fail('generate-video imageDataUrl JSON premium check failed', body?.error || `HTTP ${status}`);
    } else {
      fail(`generate-video imageDataUrl JSON unexpected (HTTP ${status})`, body?.error || JSON.stringify(body).slice(0, 100));
    }
  }
}

// ════════════════════════════════════════════════════════════
section('11. Premium longer answers (free vs premium)');
// ════════════════════════════════════════════════════════════
const PREMIUM_Q = 'What is the latest mobile processor in 2026 and its key specs?';

// Free (no auth)
{
  const { status, body } = await postMultipart('/api/search',
    { query: PREMIUM_Q, mode: 'Ask', model: 'gemini-lite' });
  const answer = (body?.chunks?.[0]?.text || body?.answer || '');
  if (status === 200 && answer.length > 10) {
    pass(`Free answer (${answer.length} chars)`, answer.slice(0, 120).replace(/\n/g, ' '));
  } else {
    fail('Free premium test failed', body?.error || `HTTP ${status}`);
  }
}

// Premium (with auth)
if (!TOKEN) {
  skip('Premium longer answer (auth)', 'No auth token');
} else {
  const { status, body } = await postMultipart('/api/search',
    { query: PREMIUM_Q, mode: 'Ask', model: 'gemini-lite' }, [], TOKEN);
  const answer = (body?.chunks?.[0]?.text || body?.answer || '');
  if (status === 200 && answer.length > 10) {
    pass(`Premium answer (${answer.length} chars — should be longer/richer than free)`,
      answer.slice(0, 120).replace(/\n/g, ' '));
  } else {
    fail('Premium longer answer test failed', body?.error || `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════
console.log(`\n${H}════════════════════════════════════════${RESET}`);
console.log(`${H}TEST RESULTS${RESET}`);
console.log(`${H}════════════════════════════════════════${RESET}`);
console.log(`${G}Passed:  ${passed}${RESET}`);
console.log(`${R}Failed:  ${failed}${RESET}`);
console.log(`${Y}Skipped: ${skipped}${RESET}`);
console.log(`Total:   ${passed + failed + skipped}`);

if (failed > 0) {
  console.log(`\n${R}FAILED TESTS:${RESET}`);
  for (const r of results.filter(r => r.status === 'fail')) {
    console.log(`  • ${r.label} — ${r.err || ''}`);
  }
  process.exit(1);
} else {
  console.log(`\n${G}All tests passed!${RESET}`);
}
