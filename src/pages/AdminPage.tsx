import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '';
const TOKEN_KEY = 'syntraiq-admin-panel-token';

type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

interface AiReport {
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
  status: ReportStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const REASON_LABELS: Record<string, string> = {
  hate_speech: 'Hate speech',
  violence: 'Violence',
  sexual_content: 'Sexual content',
  harassment: 'Harassment',
  dangerous_advice: 'Dangerous advice',
  false_information: 'False information',
  spam: 'Spam',
  other: 'Other',
};

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '—';
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export default function AdminPage() {
  const { navigateTo } = useRouterNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [reports, setReports] = useState<AiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [selected, setSelected] = useState<AiReport | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReports = useCallback(
    async (authToken: string, filter: 'all' | ReportStatus) => {
      if (!API_URL) return;
      setLoading(true);
      try {
        const q = filter === 'all' ? '' : `?status=${filter}`;
        const res = await fetch(`${API_URL}/api/admin/panel/reports${q}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.status === 401) {
          setToken(null);
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            /* ignore */
          }
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setReports(Array.isArray(data.reports) ? data.reports : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (token) void loadReports(token, statusFilter);
  }, [token, statusFilter, loadReports]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      if (!API_URL) throw new Error('VITE_API_URL is not set');
      const res = await fetch(`${API_URL}/api/admin/panel/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      setToken(data.token);
      try {
        localStorage.setItem(TOKEN_KEY, data.token);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setReports([]);
    setSelected(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  };

  const updateStatus = async (id: string, status: ReportStatus) => {
    if (!token) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`${API_URL}/api/admin/panel/reports/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...data.report } : r))
      );
      if (selected?.id === id) setSelected(data.report);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = useMemo(
    () => reports.filter((r) => r.status === 'pending').length,
    [reports]
  );

  if (!token) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--bg, #0f1115)',
        }}
      >
        <form
          onSubmit={handleLogin}
          className="glass-card"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: 28,
            borderRadius: 16,
          }}
        >
          <div className="h2" style={{ marginBottom: 4 }}>
            SyntraIQ Admin
          </div>
          <div className="sub text-sm" style={{ marginBottom: 20 }}>
            AI content reports moderation
          </div>
          <label className="sub text-sm" style={{ display: 'block', marginBottom: 6 }}>
            Email
          </label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={{ width: '100%', marginBottom: 14, padding: 10, borderRadius: 8 }}
          />
          <label className="sub text-sm" style={{ display: 'block', marginBottom: 6 }}>
            Password
          </label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8 }}
          />
          {loginError && (
            <div style={{ color: '#c0392b', marginBottom: 12, fontSize: 'var(--font-sm)' }}>
              {loginError}
            </div>
          )}
          <button
            type="submit"
            className="btn glass-button"
            disabled={loggingIn}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigateTo('/app')}
            style={{ width: '100%', marginTop: 12, padding: 10 }}
          >
            Back to app
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 16, background: 'var(--bg, #0f1115)' }}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="h2" style={{ margin: 0 }}>
              AI Reports
            </div>
            <div className="sub text-sm">
              {pendingCount} pending · {reports.length} shown
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['all', 'pending', 'reviewed', 'dismissed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`pill ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
            <button type="button" className="btn-ghost glass-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>

        {loading && <div className="sub">Loading reports…</div>}

        {!loading && reports.length === 0 && (
          <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
            No reports yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map((r) => (
            <div
              key={r.id}
              className="glass-card"
              role="button"
              tabIndex={0}
              onClick={() => setSelected(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(r);
                }
              }}
              style={{
                padding: 14,
                cursor: 'pointer',
                border:
                  selected?.id === r.id
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <strong>#{r.report_number}</strong>
                <span className="chip">{r.status}</span>
              </div>
              <div className="sub text-sm" style={{ marginBottom: 4 }}>
                <strong>User:</strong> {r.user_email || r.user_id || 'Anonymous'}
              </div>
              <div className="sub text-sm" style={{ marginBottom: 4 }}>
                <strong>Reason:</strong> {REASON_LABELS[r.reason] || r.reason}
              </div>
              <div className="sub text-sm" style={{ marginBottom: 4 }}>
                <strong>Date:</strong> {new Date(r.created_at).toLocaleString()}
              </div>
              <div className="sub text-sm" style={{ marginBottom: 4 }}>
                <strong>Prompt:</strong> {truncate(r.user_prompt, 120)}
              </div>
              <div className="sub text-sm" style={{ marginBottom: 10 }}>
                <strong>AI:</strong> {truncate(r.ai_response, 140)}
              </div>
              <div
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn-ghost glass-button"
                  disabled={updatingId === r.id || r.status === 'reviewed'}
                  onClick={() => updateStatus(r.id, 'reviewed')}
                  style={{ minHeight: 40, padding: '8px 12px', borderRadius: 999 }}
                >
                  Reviewed
                </button>
                <button
                  type="button"
                  className="btn-ghost glass-button"
                  disabled={updatingId === r.id || r.status === 'dismissed'}
                  onClick={() => updateStatus(r.id, 'dismissed')}
                  style={{ minHeight: 40, padding: '8px 12px', borderRadius: 999 }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="glass-card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>
              Report #{selected.report_number}
            </div>
            <div style={{ display: 'grid', gap: 10, fontSize: 'var(--font-sm)' }}>
              <div>
                <strong>Status:</strong> {selected.status}
              </div>
              <div>
                <strong>Reason:</strong> {REASON_LABELS[selected.reason] || selected.reason}
              </div>
              <div>
                <strong>User:</strong> {selected.user_email || selected.user_id || 'Anonymous'}
              </div>
              <div>
                <strong>Conversation:</strong> {selected.conversation_id || '—'}
              </div>
              <div>
                <strong>Message ID:</strong> {selected.message_id || '—'}
              </div>
              <div>
                <strong>Model:</strong> {selected.model_used || '—'} ·{' '}
                <strong>Mode:</strong> {selected.chat_mode || '—'}
              </div>
              <div>
                <strong>Device:</strong> {selected.device_info || '—'}
              </div>
              <div>
                <strong>User prompt</strong>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    marginTop: 6,
                    padding: 12,
                    background: 'var(--input-bg)',
                    borderRadius: 8,
                  }}
                >
                  {selected.user_prompt || '—'}
                </pre>
              </div>
              <div>
                <strong>AI response</strong>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    marginTop: 6,
                    padding: 12,
                    background: 'var(--input-bg)',
                    borderRadius: 8,
                    maxHeight: 320,
                    overflow: 'auto',
                  }}
                >
                  {selected.ai_response}
                </pre>
              </div>
              {selected.description && (
                <div>
                  <strong>Reporter notes</strong>
                  <p style={{ marginTop: 6 }}>{selected.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
