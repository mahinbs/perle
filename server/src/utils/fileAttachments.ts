import type { Express } from 'express';
import type { FileAttachment } from '../types.js';
import type { LLMModel } from '../types.js';
import { getMaxAttachments } from './modelRegistry.js';
import { supabase } from '../lib/supabase.js';

export const ALLOWED_UPLOAD_MIMES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export function isAllowedUploadMime(mime: string): boolean {
  return ALLOWED_UPLOAD_MIMES.some(
    (type) => mime === type || (type.endsWith('/') && mime.startsWith(type))
  );
}

/** Collect files from multer single, array, or fields */
export function collectUploadedFiles(req: Express.Request): Express.Multer.File[] {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const arr of Object.values(req.files)) {
      if (Array.isArray(arr)) files.push(...arr);
    }
  }
  return files;
}

export function fileToDataUrl(file: Express.Multer.File): string {
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
}

export async function processUploadedFiles(
  files: Express.Multer.File[],
  userId: string | undefined,
  storageFolder: string
): Promise<FileAttachment[]> {
  const attachments: FileAttachment[] = [];

  for (const file of files) {
    let dataUrl = fileToDataUrl(file);

    if (userId) {
      try {
        const ext = file.originalname?.split('.').pop() || 'bin';
        const fileName = `${storageFolder}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const { error } = await supabase.storage
          .from('files')
          .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });

        if (!error) {
          const { data: urlData } = supabase.storage.from('files').getPublicUrl(fileName);
          console.log(`✅ Uploaded attachment: ${fileName}`);
          void urlData;
        }
      } catch (e) {
        console.warn('Attachment Supabase upload failed, using inline buffer:', e);
      }
    }

    attachments.push({
      dataUrl,
      mimeType: file.mimetype,
      filename: file.originalname,
    });
  }

  return attachments;
}

export function normalizeAttachments(
  imageDataUrl?: string,
  attachments?: FileAttachment[]
): FileAttachment[] {
  if (attachments && attachments.length > 0) return attachments;
  if (!imageDataUrl) return [];
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return [];
  return [{ dataUrl: imageDataUrl, mimeType: match[1] }];
}

export function enforceAttachmentLimit(
  attachments: FileAttachment[],
  model: LLMModel,
  isPremium: boolean
): FileAttachment[] {
  const max = getMaxAttachments(model, isPremium);
  if (attachments.length > max) {
    console.warn(`Trimming ${attachments.length} attachments to model limit ${max}`);
    return attachments.slice(0, max);
  }
  return attachments;
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function extractPlainText(attachment: FileAttachment): string | null {
  const parsed = parseDataUrl(attachment.dataUrl);
  if (!parsed) return null;
  if (
    parsed.mimeType.startsWith('text/') ||
    parsed.mimeType === 'application/csv' ||
    parsed.mimeType.includes('spreadsheet') ||
    parsed.mimeType.includes('excel')
  ) {
    try {
      return Buffer.from(parsed.base64, 'base64').toString('utf8').slice(0, 80_000);
    } catch {
      return null;
    }
  }
  return null;
}

/** OpenAI: images via vision; docs as inlined text */
export function buildOpenAIUserContent(
  prompt: string,
  attachments: FileAttachment[]
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (attachments.length === 0) return prompt;

  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: prompt },
  ];

  const docTexts: string[] = [];
  for (const att of attachments) {
    if (att.mimeType.startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    } else {
      const text = extractPlainText(att);
      if (text) {
        docTexts.push(`--- ${att.filename || 'document'} (${att.mimeType}) ---\n${text}`);
      } else {
        docTexts.push(
          `--- ${att.filename || 'document'} (${att.mimeType}) ---\n[Binary document attached — summarize based on available context.]`
        );
      }
    }
  }

  if (docTexts.length > 0) {
    parts[0].text = `${prompt}\n\nATTACHED DOCUMENTS:\n${docTexts.join('\n\n')}`;
  }

  return parts;
}

/** Claude: native image + PDF document blocks */
export function buildClaudeUserContent(
  prompt: string,
  attachments: FileAttachment[]
): string | Array<{ type: string; text?: string; source?: object }> {
  if (attachments.length === 0) return prompt;

  const blocks: Array<{ type: string; text?: string; source?: object }> = [];

  for (const att of attachments) {
    const parsed = parseDataUrl(att.dataUrl);
    if (!parsed) continue;

    if (att.mimeType.startsWith('image/')) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: att.mimeType, data: parsed.base64 },
      });
    } else if (att.mimeType === 'application/pdf' || att.mimeType.includes('pdf')) {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: parsed.base64 },
      });
    } else {
      const text = extractPlainText(att);
      if (text) {
        blocks.push({
          type: 'text',
          text: `Document "${att.filename || 'file'}" (${att.mimeType}):\n${text}`,
        });
      }
    }
  }

  blocks.push({ type: 'text', text: prompt });
  return blocks;
}

/** Grok: OpenAI-compatible vision format */
export function buildGrokUserContent(
  prompt: string,
  attachments: FileAttachment[]
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  return buildOpenAIUserContent(prompt, attachments);
}

export function getFirstImageAttachment(attachments: FileAttachment[]): FileAttachment | undefined {
  return attachments.find((a) => a.mimeType.startsWith('image/'));
}

function describeAttachmentKind(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || mimeType.includes('pdf')) return 'PDF document';
  return 'document';
}

export const FILE_ONLY_DEFAULT_QUERY = 'Review the attached files.';

export function resolveQueryWithAttachments(
  query: string,
  attachmentCount: number
): string {
  const trimmed = query.trim();
  if (trimmed) return trimmed;
  if (attachmentCount > 0) return FILE_ONLY_DEFAULT_QUERY;
  return '';
}

export function formatAttachmentManifest(attachments: FileAttachment[]): string {
  return attachments
    .map((att, i) => {
      const name = att.filename || `attachment-${i + 1}`;
      return `${i + 1}. ${name} (${describeAttachmentKind(att.mimeType)})`;
    })
    .join('\n');
}

/** Detect when the user wants file/document analysis */
export function isAnalysisQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  const patterns = [
    /\banalyz(e|ing|is)?\b/,
    /\bsummar(i[sz]e|y|ies)\b/,
    /\breview\b/,
    /\bexplain\b.*\b(file|doc|pdf|image|attach)/,
    /\b(both|all|each|every)\b/,
    /\bwhat\b.*\b(in|about|inside)\b.*\b(file|doc|pdf|image|attach)/,
    /\bread\b.*\b(file|doc|pdf|attach)/,
    /\bdescribe\b.*\b(file|image|doc|pdf|attach)/,
    /\btell me about\b.*\b(file|doc|pdf|image|attach)/,
  ];
  return patterns.some((p) => p.test(q));
}

/** Detect vague messages where user uploaded files but didn't ask anything specific */
export function isImplicitFileReviewQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (q.length <= 4 && !/[a-z]{5,}/.test(q)) return true;
  const implicit = [
    'hi', 'hello', 'hey', 'ok', 'okay', 'thanks', 'thank you', 'help',
    '?', '...', 'yo', 'sup', 'hmm', 'hm', 'see', 'look', 'check',
    'this', 'these', 'it', 'them', 'files', 'docs', 'documents',
  ];
  return implicit.includes(q) || isAnalysisQuery(query);
}

/** System-level rules — ALWAYS active when any file is attached */
export function buildAttachmentSystemAddon(
  attachments: FileAttachment[],
  _query = ''
): string {
  if (attachments.length === 0) return '';

  const fileList = formatAttachmentManifest(attachments);

  if (attachments.length > 1) {
    return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📎 UPLOADED FILES (${attachments.length}) — PRIMARY CONTEXT (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The user attached ${attachments.length} files. Treat them as the MAIN subject of your answer — even if the message is short, vague, or does not say "analyze".

Files attached:
${fileList}

YOU MUST:
1. Address EVERY attached file — one clearly labeled section per filename (never skip images when PDFs are also present)
2. For images: describe what you see (logos, text, colors, branding, people, UI, etc.)
3. For PDFs/documents: summarize key content, structure, and purpose
4. After per-file sections, add a "How they connect" (or "Overall") section:
   - If files relate to the same project, brand, client, or topic → explain the connection clearly
   - If unrelated → state that briefly, then still cover each file fully
5. Then answer the user's text question only if it adds something beyond the uploads

Skipping any file is a failure. Behave like ChatGPT/Gemini when multiple files are uploaded.`;
  }

  const att = attachments[0];
  const name = att.filename || 'attached file';
  const kind = describeAttachmentKind(att.mimeType);
  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📎 UPLOADED FILE — PRIMARY CONTEXT (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The user attached: "${name}" (${kind}).

Base your answer on this file's actual contents. If the user's message is vague (e.g. "hi", "this", "check it"), describe and explain the attachment. Do not ignore the upload.`;
}

/** User-prompt reinforcement — ALWAYS when files are present */
export function augmentPromptForAttachments(
  prompt: string,
  attachments: FileAttachment[],
  query = ''
): string {
  if (attachments.length === 0) return prompt;

  const fileList = formatAttachmentManifest(attachments);
  const implicit = isImplicitFileReviewQuery(query);

  if (attachments.length > 1) {
    const userLine = implicit
      ? 'The user uploaded multiple files without a specific question — review ALL of them.'
      : `User message: "${query.trim() || '(no specific question — focus on the uploads)'}"`;

    return `${prompt}

[${userLine}

Attached files (cover every one, then explain connections if related):
${fileList}

Required: separate section per file → then "How they connect" or "Overall" → then answer the user message if relevant.]`;
  }

  const att = attachments[0];
  const name = att.filename || 'the attached file';
  const kind = describeAttachmentKind(att.mimeType);
  if (implicit) {
    return `${prompt}\n\n[User attached 1 ${kind} ("${name}"). Describe and explain it — this is the main task.]`;
  }
  return `${prompt}\n\n[User attached "${name}" (${kind}). Ground your answer in this file; do not ignore it.]`;
}

/** Gemini: inline file data + reminder after attachments */
export function appendGeminiAttachmentParts(parts: any[], attachments: FileAttachment[]): void {
  for (const att of attachments) {
    const parsed = parseDataUrl(att.dataUrl);
    if (!parsed) continue;
    const mime =
      att.mimeType === 'application/pdf' || att.mimeType.includes('pdf')
        ? 'application/pdf'
        : att.mimeType;

    parts.push({
      inlineData: { mimeType: mime, data: parsed.base64 },
    });
    console.log(`📎 Gemini attachment: ${att.filename || mime}`);
  }

  if (attachments.length > 1) {
    const names = attachments.map((a, i) => a.filename || `file ${i + 1}`).join(', ');
    parts.push({
      text: `↑ ${attachments.length} files above (${names}). Cover EACH file in your reply, then explain how they connect if related. Do not omit any file.`,
    });
  } else if (attachments.length === 1) {
    const name = attachments[0].filename || 'the attached file';
    parts.push({
      text: `↑ 1 file attached ("${name}"). Your answer must be based on this file.`,
    });
  }
}
