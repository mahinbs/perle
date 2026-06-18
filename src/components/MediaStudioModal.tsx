import { createPortal } from "react-dom";
import { FaDownload, FaSpinner, FaTimes } from "react-icons/fa";

export type MediaStudioModalView =
  | "generating"
  | "result"
  | "auth"
  | "upgrade";

type MediaStudioModalProps = {
  view: MediaStudioModalView | null;
  mediaType: "image" | "video";
  prompt?: string;
  previewUrl?: string | null;
  resultUrl?: string | null;
  onClose: () => void;
  onLogin: () => void;
  onUpgrade: () => void;
  onDownload?: () => void;
};

export function MediaStudioModal({
  view,
  mediaType,
  prompt,
  previewUrl,
  resultUrl,
  onClose,
  onLogin,
  onUpgrade,
  onDownload,
}: MediaStudioModalProps) {
  if (!view) return null;

  const label = mediaType === "image" ? "Image" : "Video";

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
        className="fixed left-1/2 top-1/2 z-[100002] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          maxHeight: "85vh",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {view === "auth" && (
          <div className="p-6 text-center">
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
          <div className="p-6 text-center">
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
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold">Generating {label}</div>
            </div>
            {prompt ? (
              <div className="text-sm p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] mb-4 line-clamp-4">
                {prompt}
              </div>
            ) : null}
            {previewUrl && mediaType === "image" ? (
              <img
                src={previewUrl}
                alt="Source"
                className="w-full max-h-40 object-contain rounded-lg border border-[var(--border)] mb-4"
              />
            ) : null}
            <div className="flex items-center justify-center gap-3 py-6">
              <FaSpinner className="animate-spin text-[var(--accent)]" size={22} />
              <span className="text-sm opacity-80">
                {mediaType === "image" ? "Generaing your image…" : "Creating your video…"}
              </span>
            </div>
            <p className="text-xs text-center opacity-60">
              This may take up to a minute. Please keep the app open.
            </p>
          </div>
        )}

        {view === "result" && resultUrl && (
          <div className="relative">
            <button
              type="button"
              className="absolute top-3 right-3 z-10 btn-ghost glass-button w-9 h-9 rounded-full flex items-center justify-center"
              onClick={onClose}
              aria-label="Close"
            >
              <FaTimes size={14} />
            </button>
            {onDownload ? (
              <button
                type="button"
                className="absolute top-3 left-3 z-10 btn-ghost glass-button w-9 h-9 rounded-full flex items-center justify-center"
                onClick={onDownload}
                aria-label="Download"
              >
                <FaDownload size={14} />
              </button>
            ) : null}
            <div className="p-4 pt-12">
              {mediaType === "image" ? (
                <img
                  src={resultUrl}
                  alt="Generated result"
                  className="w-full max-h-[50vh] object-contain rounded-lg border border-[var(--border)]"
                />
              ) : (
                <video
                  src={resultUrl}
                  controls
                  playsInline
                  className="w-full max-h-[50vh] object-contain rounded-lg border border-[var(--border)] bg-black"
                />
              )}
              {prompt ? (
                <p className="mt-3 text-sm p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] line-clamp-3">
                  {prompt}
                </p>
              ) : null}
              <button
                type="button"
                className="btn w-full mt-4 py-2.5 rounded-lg font-semibold"
                style={{ background: "var(--accent)", color: "#111" }}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
