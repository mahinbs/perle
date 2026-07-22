import { Capacitor } from '@capacitor/core';
import { getAuthToken } from '../utils/auth';

export const AI_REPORT_REASONS = [
  { id: 'hate_speech', label: 'Hate speech' },
  { id: 'violence', label: 'Violence' },
  { id: 'sexual_content', label: 'Sexual content' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'dangerous_advice', label: 'Dangerous advice' },
  { id: 'false_information', label: 'False information' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Other' },
] as const;

export type AiReportReasonId = (typeof AI_REPORT_REASONS)[number]['id'];

export interface SubmitAiReportPayload {
  reason: AiReportReasonId;
  description?: string;
  userPrompt?: string;
  aiResponse: string;
  conversationId?: string;
  messageId?: string;
  modelUsed?: string;
  chatMode?: string;
}

function deviceInfo(): string {
  try {
    const parts = [
      Capacitor.getPlatform(),
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
    ].filter(Boolean);
    return parts.join(' | ').slice(0, 1000);
  } catch {
    return 'unknown';
  }
}

export async function submitAiContentReport(
  payload: SubmitAiReportPayload
): Promise<{ ok: boolean; message: string; reportNumber?: number }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    throw new Error('Backend API not configured (VITE_API_URL).');
  }

  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/ai-reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...payload,
      deviceInfo: deviceInfo(),
      appVersion:
        (import.meta.env.VITE_APP_VERSION as string | undefined) || '1.0.0',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Report failed (${res.status})`
    );
  }

  return {
    ok: true,
    message:
      (data as { message?: string }).message ||
      "Thank you. Your report has been received. We'll review it.",
    reportNumber: (data as { reportNumber?: number }).reportNumber,
  };
}
