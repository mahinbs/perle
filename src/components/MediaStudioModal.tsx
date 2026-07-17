import { createPortal } from "react-dom";
import { FaDownload, FaShareAlt, FaSpinner, FaTimes } from "react-icons/fa";

export type MediaStudioModalView =
  | "generating"
  | "result"
  | "auth"
  | "upgrade";

type MediaStudioModalProps = {
  view: MediaStudioModalView | null;
  mediaType: "image" | "video";
  prompt?: string;
  /** @deprecated Prefer previewUrls — kept for single-image callers */
  previewUrl?: string | null;
  /** All uploaded reference images shown while generating */
  previewUrls?: string[] | null;
  resultUrl?: string | null;
  onClose: () => void;
  onLogin: () => void;
  onUpgrade: () => void;
  onDownload?: () => void;
  onShare?: () => void;
};

function MediaActionOverlay({
  onDownload,
  onShare,
}: {
  onDownload?: () => void;
  onShare?: () => void;
}) {
  if (!onDownload && !onShare) return null;
  return (
    <div
      className="absolute top-2 right-2 z-10 flex items-center gap-1.5"
      style={{ pointerEvents: "auto" }}
    >
      {onShare ? (
        <button
          type="button"
          className="media-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          aria-label="Share"
          title="Share"
        >
          <FaShareAlt size={13} />
        </button>
      ) : null}
      {onDownload ? (
        <button
          type="button"
          className="media-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          aria-label="Download"
          title="Download"
        >
          <FaDownload size={13} />
        </button>
      ) : null}
    </div>
  );
}

export function MediaStudioModal({
  view,
  mediaType,
  prompt,
  previewUrl,
  previewUrls,
  resultUrl,
  onClose,
  onLogin,
  onUpgrade,
  onDownload,
  onShare,
}: MediaStudioModalProps) {
  if (!view) return null;

  const label = mediaType === "image" ? "Image" : "Video";
  const sourcePreviews = (
    previewUrls && previewUrls.length > 0
      ? previewUrls
      : previewUrl
        ? [previewUrl]
        : []
  ).filter(Boolean);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100001]"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
        onMouseDown={view === "generating" ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="media-studio-modal fixed z-[100002] flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] shadow-2xl"
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(94vw, 420px)",
          maxHeight: "min(88dvh, 88vh)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {view === "auth" && (
          <div className="p-5 sm:p-6 text-center overflow-y-auto">
            <div className="text-lg font-semibold mb-2">Sign in required</div>
            <p className="text-sm opacity-75 mb-5">
              Log in to generate images and videos with AI.
            </p>
            <div className="flex gap-3">
              <button type="button" className="flex-1 glass-button py-2.5 rounded-lg" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-lg font-semibold"
                style={{ background: "var(--accent)", color: "#111" }}
                onClick={onLogin}
              >
                Log in
              </button>
            </div>
          </div>
        )}

        {view === "upgrade" && (
          <div className="p-5 sm:p-6 text-center overflow-y-auto">
            <div className="text-lg font-semibold mb-2">Pro or Max required</div>
            <p className="text-sm opacity-75 mb-5">
              Video generation is available on IQ Pro and IQ Max plans.
            </p>
            <div className="flex gap-3">
              <button type="button" className="flex-1 glass-button py-2.5 rounded-lg" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-lg font-semibold"
                style={{ background: "var(--accent)", color: "#111" }}
                onClick={onUpgrade}
              >
                View plans
              </button>
            </div>
          </div>
        )}

        {view === "generating" && (
          <div className="p-4 sm:p-5 overflow-y-auto min-h-0">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="font-semibold truncate">Generating {label}</div>
              <button
                type="button"
                className="btn-ghost glass-button w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                onClick={onClose}
                aria-label="Close"
              >
                <FaTimes size={14} />
              </button>
            </div>
            {prompt ? (
              <div className="text-sm p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] mb-4 line-clamp-4">
                {prompt}
              </div>
            ) : null}
            {sourcePreviews.length > 0 && mediaType === "image" ? (
              <div
                className="mb-4 grid gap-2"
                style={{
                  gridTemplateColumns:
                    sourcePreviews.length === 1
                      ? "1fr"
                      : sourcePreviews.length === 2
                        ? "repeat(2, minmax(0, 1fr))"
                        : "repeat(auto-fill, minmax(72px, 1fr))",
                }}
              >
                {sourcePreviews.map((src, i) => (
                  <img
                    key={`${src.slice(0, 48)}-${i}`}
                    src={src}
                    alt={`Reference ${i + 1}`}
                    className={
                      sourcePreviews.length === 1
                        ? "w-full max-h-36 object-contain rounded-lg border border-[var(--border)]"
                        : "w-full aspect-square object-cover rounded-lg border border-[var(--border)]"
                    }
                  />
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-center gap-3 py-6">
              <FaSpinner className="animate-spin text-[var(--accent)]" size={22} />
              <span className="text-sm opacity-80">
                {mediaType === "image" ? "Generating your image…" : "Creating your video…"}
              </span>
            </div>
            <p className="text-xs text-center opacity-60 pb-1">
              This may take up to a minute. Please keep the app open.
            </p>
          </div>
        )}

        {view === "result" && resultUrl && (
          <div className="flex flex-col min-h-0 max-h-[inherit]">
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
              <div className="font-semibold text-sm truncate">
                {mediaType === "image" ? "Generated image" : "Generated video"}
              </div>
              <button
                type="button"
                className="btn-ghost glass-button w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                onClick={onClose}
                aria-label="Close"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4">
              <div className="relative rounded-lg overflow-hidden border border-[var(--border)]">
                {mediaType === "image" ? (
                  <img
                    src={resultUrl}
                    alt="Generated result"
                    className="w-full max-h-[min(42dvh,320px)] object-contain bg-[var(--card)]"
                  />
                ) : (
                  <video
                    src={resultUrl}
                    controls
                    playsInline
                    className="w-full max-h-[min(42dvh,320px)] object-contain bg-black"
                  />
                )}
                <MediaActionOverlay onDownload={onDownload} onShare={onShare} />
              </div>
              {prompt ? (
                <p className="mt-3 text-sm p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] line-clamp-3">
                  {prompt}
                </p>
              ) : null}
            </div>

            <div
              className="shrink-0 px-4 pt-3 flex flex-col gap-2 border-t border-[var(--border)]"
              style={{
                paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
              }}
            >
              <button
                type="button"
                className="w-full py-2.5 rounded-lg font-semibold glass-button"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        .media-action-btn {
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.62);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
        }
        .media-action-btn:active {
          transform: scale(0.96);
        }
        @media (max-width: 380px) {
          .media-studio-modal {
            width: calc(100vw - 16px) !important;
            max-height: min(92dvh, 92vh) !important;
            border-radius: 16px !important;
          }
        }
      `}</style>
    </>,
    document.body
  );
}
