import { supabase } from '../lib/supabase.js';
import { redisGetJSON, redisSetJSON, isRedisEnabled } from '../lib/redis.js';

export type AiReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface AiContentReport {
  id: string;
  report_number: number;
  user_id: string | null;
  user_email: string | null;
  conversation_id: string | null;
  message_id: string | null;
  user_prompt: string | null;
  ai_response: string;
  reason: string;
  description: string | null;
  model_used: string | null;
  chat_mode: string | null;
  device_info: string | null;
  app_version: string | null;
  status: AiReportStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAiReportInput {
  userId?: string | null;
  userEmail?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  userPrompt?: string | null;
  aiResponse: string;
  reason: string;
  description?: string | null;
  modelUsed?: string | null;
  chatMode?: string | null;
  deviceInfo?: string | null;
  appVersion?: string | null;
}

const REDIS_INDEX_KEY = 'ai-reports:index:v1';
const REDIS_TTL_SEC = 90 * 24 * 60 * 60; // 90 days
const MEMORY_REPORTS = new Map<string, AiContentReport>();
const MEMORY_INDEX: string[] = [];

function redisItemKey(id: string): string {
  return `ai-reports:item:${id}`;
}

function memorySave(report: AiContentReport): void {
  MEMORY_REPORTS.set(report.id, report);
  const i = MEMORY_INDEX.indexOf(report.id);
  if (i >= 0) MEMORY_INDEX.splice(i, 1);
  MEMORY_INDEX.unshift(report.id);
  if (MEMORY_INDEX.length > 5000) {
    const drop = MEMORY_INDEX.pop();
    if (drop) MEMORY_REPORTS.delete(drop);
  }
}

function memoryList(): AiContentReport[] {
  return MEMORY_INDEX.map((id) => MEMORY_REPORTS.get(id)).filter(
    (r): r is AiContentReport => Boolean(r)
  );
}

function newId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readRedisIndex(): Promise<string[]> {
  const ids = await redisGetJSON<string[]>(REDIS_INDEX_KEY);
  return Array.isArray(ids) ? ids : [];
}

async function writeRedisIndex(ids: string[]): Promise<void> {
  await redisSetJSON(REDIS_INDEX_KEY, ids.slice(0, 5000), REDIS_TTL_SEC);
}

async function saveRedisReport(report: AiContentReport): Promise<void> {
  memorySave(report);
  if (!isRedisEnabled()) return;
  await redisSetJSON(redisItemKey(report.id), report, REDIS_TTL_SEC);
  const ids = await readRedisIndex();
  const next = [report.id, ...ids.filter((x) => x !== report.id)].slice(0, 5000);
  await writeRedisIndex(next);
}

async function listRedisReports(): Promise<AiContentReport[]> {
  if (isRedisEnabled()) {
    const ids = await readRedisIndex();
    const out: AiContentReport[] = [];
    for (const id of ids) {
      const item = await redisGetJSON<AiContentReport>(redisItemKey(id));
      if (item) out.push(item);
    }
    if (out.length > 0) {
      return out.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  }
  return memoryList();
}

export async function createAiContentReport(
  input: CreateAiReportInput
): Promise<AiContentReport> {
  const now = new Date().toISOString();
  const row = {
    user_id: input.userId || null,
    user_email: input.userEmail || null,
    conversation_id: input.conversationId || null,
    message_id: input.messageId || null,
    user_prompt: (input.userPrompt || '').slice(0, 8000) || null,
    ai_response: input.aiResponse.slice(0, 20000),
    reason: input.reason,
    description: (input.description || '').slice(0, 4000) || null,
    model_used: input.modelUsed || null,
    chat_mode: input.chatMode || null,
    device_info: (input.deviceInfo || '').slice(0, 1000) || null,
    app_version: input.appVersion || null,
    status: 'pending' as const,
    admin_notes: null as string | null,
  };

  try {
    const { data, error } = await supabase
      .from('ai_content_reports')
      .insert(row)
      .select('*')
      .single();

    if (!error && data) {
      const report = data as AiContentReport;
      void saveRedisReport(report);
      return report;
    }
    if (error) {
      console.warn('ai_content_reports insert failed, using Redis fallback:', error.message);
    }
  } catch (e) {
    console.warn(
      'ai_content_reports unavailable, using Redis fallback:',
      e instanceof Error ? e.message : e
    );
  }

  const ids = await readRedisIndex();
  const report: AiContentReport = {
    id: newId(),
    report_number: ids.length + 1,
    ...row,
    created_at: now,
    updated_at: now,
  };
  await saveRedisReport(report);
  return report;
}

export async function listAiContentReports(opts?: {
  status?: AiReportStatus | 'all';
  limit?: number;
}): Promise<AiContentReport[]> {
  const limit = Math.min(Math.max(opts?.limit || 200, 1), 500);
  const status = opts?.status || 'all';

  try {
    let q = supabase
      .from('ai_content_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as AiContentReport[];
    }
  } catch (e) {
    console.warn('list ai_content_reports failed:', e instanceof Error ? e.message : e);
  }

  let redis = await listRedisReports();
  if (status !== 'all') redis = redis.filter((r) => r.status === status);
  return redis.slice(0, limit);
}

export async function updateAiContentReportStatus(
  id: string,
  status: AiReportStatus,
  adminNotes?: string | null
): Promise<AiContentReport | null> {
  const now = new Date().toISOString();
  try {
    const patch: Record<string, unknown> = { status, updated_at: now };
    if (adminNotes !== undefined) patch.admin_notes = adminNotes;
    const { data, error } = await supabase
      .from('ai_content_reports')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (!error && data) {
      const report = data as AiContentReport;
      void saveRedisReport(report);
      return report;
    }
  } catch (e) {
    console.warn('update ai_content_reports failed:', e instanceof Error ? e.message : e);
  }

  const existing =
    (await redisGetJSON<AiContentReport>(redisItemKey(id))) ||
    MEMORY_REPORTS.get(id) ||
    null;
  if (!existing) return null;
  const updated: AiContentReport = {
    ...existing,
    status,
    admin_notes: adminNotes !== undefined ? adminNotes : existing.admin_notes,
    updated_at: now,
  };
  await saveRedisReport(updated);
  return updated;
}
