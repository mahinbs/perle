import { createPortal } from "react-dom";
import { FaTimes } from "react-icons/fa";
import type { UsageLimitKind } from "../utils/queryLimit";
import { getUsageLimitMessage } from "../utils/queryLimit";

type UsageLimitModalProps = {
  kind: UsageLimitKind;
  onClose: () => void;
  onSelectPlan: (plan: "pro" | "max") => void;
};

export function UsageLimitModal({
  kind,
  onClose,
  onSelectPlan,
}: UsageLimitModalProps) {
  const title =
    kind === "analyze"
      ? "Analysis limit reached"
      : kind === "media"
        ? "Generation limit reached"
        : "Search limit reached";

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100001]"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
        onMouseDown={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 z-[100002] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden"
        style={{ background: "var(--bg)", color: "var(--text)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="text-lg font-semibold">{title}</div>
            <button
              type="button"
              className="btn-ghost glass-button w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              onClick={onClose}
              aria-label="Close"
            >
              <FaTimes size={14} />
            </button>
          </div>
          <p className="text-sm opacity-80 leading-relaxed mb-5">
            {getUsageLimitMessage(kind)}
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="w-full py-3 rounded-xl font-semibold"
              style={{ background: "var(--accent)", color: "#111" }}
              onClick={() => onSelectPlan("pro")}
            >
              Get IQ Pro
            </button>
            <button
              type="button"
              className="w-full py-3 rounded-xl font-semibold glass-button border border-[var(--border)]"
              onClick={() => onSelectPlan("max")}
            >
              Get IQ Max
            </button>
            <button
              type="button"
              className="w-full py-2.5 rounded-xl text-sm opacity-70"
              onClick={onClose}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
