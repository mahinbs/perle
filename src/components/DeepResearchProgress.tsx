import { useEffect, useRef, useState } from "react";

/**
 * Loading UI shown while Deep Research is running.
 *
 * Deep Research can take 60-180 seconds because the backend runs multiple
 * web searches, reads sources, and writes a long structured report. With
 * no UI feedback, users assume the app froze. This component mirrors how
 * Perplexity Pro, Gemini Deep Think, and Poe show progress: a stage label
 * that advances over time, plus a running elapsed-time counter.
 *
 * The stages are TIME-BASED (we don't have real progress signal from
 * Perplexity until the SSE stream starts emitting tokens). The exact
 * thresholds are tuned to typical sonar-deep-research timings:
 *   0-8s     "Understanding your question"
 *   8-25s    "Searching the web for sources"
 *   25-60s   "Reading and analysing sources"
 *   60-150s  "Writing your detailed report"
 *   150s+    "Almost done — formatting"
 *
 * If the real stream emits a `sources` event we advance immediately to
 * the "Reading" stage; once tokens start arriving the component is
 * unmounted by the parent and replaced with the streaming answer view.
 */
interface DeepResearchProgressProps {
  /** True once the backend has emitted at least one sources event. */
  sourcesReceived: boolean;
  /** Optional: number of source URLs the backend grounded against. */
  sourceCount?: number;
}

const STAGES = [
  { thresholdMs: 0, emoji: "🧠", label: "Understanding your question" },
  { thresholdMs: 8_000, emoji: "🔍", label: "Searching the web for sources" },
  { thresholdMs: 25_000, emoji: "📚", label: "Reading and analysing sources" },
  { thresholdMs: 60_000, emoji: "✍️", label: "Writing your detailed report" },
  { thresholdMs: 150_000, emoji: "🎯", label: "Almost done — formatting" },
];

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export function DeepResearchProgress({
  sourcesReceived,
  sourceCount,
}: DeepResearchProgressProps) {
  const startTsRef = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startTsRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Pick stage: real sources event jumps us to "Reading" if we're still on
  // the searching label; otherwise advance based on elapsed time.
  let stage = STAGES[0];
  for (const s of STAGES) {
    if (elapsedMs >= s.thresholdMs) stage = s;
  }
  if (sourcesReceived && stage.thresholdMs < STAGES[2].thresholdMs) {
    stage = STAGES[2]; // jump to "Reading" once we know we have sources
  }

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 16,
        background: "var(--card)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxWidth: 520,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Stage line */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
          {stage.emoji}
        </span>
        <span
          style={{
            fontSize: "var(--font-md)",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {stage.label}
          <span className="thinking-dots" aria-hidden>
            …
          </span>
        </span>
      </div>

      {/* Progress bar — indeterminate, animated. Deep Research has no
          authoritative progress signal from upstream, so we show an
          animated bar to communicate "still working", not "X% done". */}
      <div
        style={{
          width: "100%",
          height: 6,
          borderRadius: 999,
          background: "var(--input-bg)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          className="deep-research-progress-bar"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "33%",
            background:
              "linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)",
            borderRadius: 999,
          }}
        />
      </div>

      {/* Stage list + elapsed timer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--sub)",
        }}
      >
        <span>
          {sourceCount
            ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} grounded`
            : "Deep Research runs across multiple searches"}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      {/* Inline keyframes — kept local so this component is drop-in. */}
      <style>{`
        @keyframes deep-research-progress-anim {
          0%   { left: -33%; }
          100% { left: 100%; }
        }
        .deep-research-progress-bar {
          animation: deep-research-progress-anim 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
