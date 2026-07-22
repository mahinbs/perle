import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AI_REPORT_REASONS,
  submitAiContentReport,
  type AiReportReasonId,
} from '../services/aiReportService';

export interface ReportAIResponseModalProps {
  open: boolean;
  onClose: () => void;
  aiResponse: string;
  userPrompt?: string;
  conversationId?: string;
  messageId?: string;
  modelUsed?: string;
  chatMode?: string;
}

/** Google Play–compliant in-app report dialog for AI-generated content. */
export function ReportAIResponseModal({
  open,
  onClose,
  aiResponse,
  userPrompt,
  conversationId,
  messageId,
  modelUsed,
  chatMode,
}: ReportAIResponseModalProps) {
  const titleId = useId();
  const [reason, setReason] = useState<AiReportReasonId | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setDescription('');
    setSubmitting(false);
    setDone(false);
    setError(null);
  }, [open]);

  // Lock background scroll while open (mobile-friendly).
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please select a reason.');
      return;
    }
    if (!aiResponse?.trim()) {
      setError('Nothing to report.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitAiContentReport({
        reason,
        description: description.trim() || undefined,
        userPrompt,
        aiResponse: aiResponse.trim(),
        conversationId,
        messageId,
        modelUsed,
        chatMode,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:
          'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: 'min(92vh, 720px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: 'clamp(16px, 4vw, 24px)',
          borderRadius: 16,
          boxSizing: 'border-box',
          margin: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div id={titleId} className="h3" style={{ marginBottom: 8 }}>
              Thank you
            </div>
            <div className="sub" style={{ marginBottom: 20, lineHeight: 1.55 }}>
              Your report has been received.
              <br />
              We&apos;ll review it.
            </div>
            <button
              type="button"
              className="btn glass-button"
              onClick={onClose}
              style={{
                padding: '12px 28px',
                minHeight: 44,
                borderRadius: 999,
                fontWeight: 600,
                touchAction: 'manipulation',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div id={titleId} className="h3" style={{ marginBottom: 6 }}>
              Report AI Response
            </div>
            <div className="sub text-sm" style={{ marginBottom: 16, lineHeight: 1.45 }}>
              Why are you reporting this? Reports help us review harmful or
              offensive AI-generated content.
            </div>

            <div
              role="radiogroup"
              aria-label="Report reason"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}
            >
              {AI_REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 48,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: `1px solid ${
                      reason === r.id ? 'var(--accent)' : 'var(--border)'
                    }`,
                    background:
                      reason === r.id ? 'rgba(199,168,105,0.12)' : 'var(--input-bg)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  <input
                    type="radio"
                    name="ai-report-reason"
                    value={r.id}
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 'var(--font-md)', lineHeight: 1.3 }}>
                    {r.label}
                  </span>
                </label>
              ))}
            </div>

            <label
              className="sub text-sm"
              htmlFor="ai-report-description"
              style={{ display: 'block', marginBottom: 6 }}
            >
              Optional description
            </label>
            <textarea
              id="ai-report-description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details that help our review…"
              rows={3}
              maxLength={4000}
              style={{
                width: '100%',
                resize: 'vertical',
                marginBottom: 12,
                borderRadius: 10,
                padding: 12,
                boxSizing: 'border-box',
                fontSize: '16px', // avoid iOS zoom
              }}
            />

            {error && (
              <div
                role="alert"
                style={{ color: '#c0392b', fontSize: 'var(--font-sm)', marginBottom: 12 }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'stretch',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn-ghost glass-button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  flex: '1 1 120px',
                  padding: '12px 16px',
                  minHeight: 44,
                  borderRadius: 999,
                  touchAction: 'manipulation',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn glass-button"
                onClick={handleSubmit}
                disabled={submitting || !reason}
                style={{
                  flex: '1 1 140px',
                  padding: '12px 20px',
                  minHeight: 44,
                  borderRadius: 999,
                  fontWeight: 600,
                  opacity: submitting || !reason ? 0.6 : 1,
                  touchAction: 'manipulation',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
