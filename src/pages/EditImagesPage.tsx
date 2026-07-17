import { useState, useRef } from "react";
import { IoIosArrowBack } from "react-icons/io";
import { FaImage, FaSpinner, FaTimes } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import { generateImageApi } from "../utils/mediaApi";
import { getUserFriendlyErrorMessage } from "../utils/helpers";
import {
  hasReachedLifetimeMediaLimit,
  incrementLifetimeMediaCount,
  shouldEnforceUsageLimits,
  type UsageLimitKind,
} from "../utils/queryLimit";
import { UsageLimitModal } from "../components/UsageLimitModal";
import {
  MediaStudioModal,
  type MediaStudioModalView,
} from "../components/MediaStudioModal";
import { downloadMedia, shareMedia } from "../utils/downloadMedia";

const TEMPLATES = [
  { id: "enhance", label: "Enhance quality", prompt: "Enhance this image with sharper details, better lighting and vivid colors" },
  { id: "remove-bg", label: "Remove background", prompt: "Remove the background and place the subject on a clean white studio backdrop" },
  { id: "style", label: "Artistic style", prompt: "Transform this image into a watercolor painting style with soft brush strokes" },
  { id: "retro", label: "Retro filter", prompt: "Apply a warm vintage film look with subtle grain and faded tones" },
  { id: "cartoon", label: "Cartoonify", prompt: "Convert this image into a vibrant cartoon illustration style" },
  { id: "night", label: "Day to night", prompt: "Transform this daytime scene into a dramatic night scene with moonlight" },
];

export default function EditImagesPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [modalView, setModalView] = useState<MediaStudioModalView | null>(null);
  const [activePrompt, setActivePrompt] = useState("");
  const [usageLimitModal, setUsageLimitModal] = useState<UsageLimitKind | null>(null);

  const goToSubscriptionPlan = (plan: "pro" | "max") => {
    setUsageLimitModal(null);
    navigateTo("/subscription", { plan, limitReached: true });
  };

  const handleFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) {
      showToast({ message: "Image must be under 20 MB", type: "error", duration: 3000 });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    setResultUrl(null);
  };

  const handleGenerate = async () => {
    if (!imageFile || !prompt.trim()) return;

    if (shouldEnforceUsageLimits() && hasReachedLifetimeMediaLimit()) {
      setUsageLimitModal("media");
      return;
    }

    const promptText = prompt.trim();
    setActivePrompt(promptText);
    setIsGenerating(true);
    setModalView("generating");
    setResultUrl(null);

    try {
      const result = await generateImageApi(promptText, "1:1", imageFile);
      setResultUrl(result.url);
      setModalView("result");
      if (shouldEnforceUsageLimits()) {
        incrementLifetimeMediaCount();
      }
      showToast({ message: "Image edited!", type: "success", duration: 3000 });
    } catch (e: unknown) {
      const message = getUserFriendlyErrorMessage(
        e instanceof Error ? e.message : "Image edit failed"
      );
      setModalView(null);
      showToast({ message, type: "error", duration: 4000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    try {
      const saved = await downloadMedia(resultUrl, `edited-image-${Date.now()}.png`);
      if (saved) {
        showToast({ message: "Saved successfully", type: "success", duration: 2500 });
      }
    } catch {
      showToast({ message: "Download failed", type: "error", duration: 3000 });
    }
  };

  const handleShare = async () => {
    if (!resultUrl) return;
    try {
      await shareMedia(resultUrl, `edited-image-${Date.now()}.png`);
    } catch {
      showToast({ message: "Share failed", type: "error", duration: 3000 });
    }
  };

  return (
    <div className="container h-full flex flex-col !p-0">
      <div className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="flex items-center gap-3 p-4">
          <button className="btn-ghost glass-button p-2!" onClick={() => navigateTo("/app")} aria-label="Back">
            <IoIosArrowBack size={24} />
          </button>
          <div>
            <div className="h3 mb-0">Edit Images</div>
            <div className="sub text-sm opacity-70">Upload and transform with AI</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div
          className="flex gap-3 mb-6 overflow-x-auto pb-2 no-scrollbar"
          style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
        >
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setPrompt(template.prompt)}
              className="glass-card border border-[var(--border)] rounded-xl p-4 text-left shrink-0 hover:border-[var(--accent)] transition-colors"
              style={{ width: 180, scrollSnapAlign: "start" }}
            >
              <FaImage size={16} className="text-[var(--accent)] mb-2" />
              <div className="text-sm font-semibold mb-1">{template.label}</div>
            </button>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {!preview ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="glass-card border border-dashed border-[var(--border)] rounded-xl w-full p-8 flex flex-col items-center gap-3"
          >
            <FaImage size={28} className="text-[var(--accent)]" />
            <span className="text-sm opacity-70">Tap to upload an image</span>
          </button>
        ) : (
          <div className="relative mb-4">
            <img src={preview} alt="Upload preview" className="w-full max-h-[280px] object-contain rounded-xl border border-[var(--border)]" />
            <button
              type="button"
              className="absolute top-2 right-2 btn-ghost glass-button w-8 h-8 rounded-full flex items-center justify-center"
              onClick={() => {
                setPreview(null);
                setImageFile(null);
                setResultUrl(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              aria-label="Remove image"
            >
              <FaTimes size={12} />
            </button>
          </div>
        )}

        {resultUrl && !modalView && (
          <div className="glass-card border border-[var(--border)] rounded-xl overflow-hidden mb-6">
            <img src={resultUrl} alt="Edited result" className="w-full max-h-[300px] object-contain" />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border)] sticky bottom-0 bg-[var(--bg)] input-bar-safe-bottom">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe how to edit your image..."
          className="w-full glass-panel border border-[var(--border)] rounded-xl p-3 text-[var(--text)] bg-transparent resize-none min-h-[80px] mb-3 outline-none"
          rows={3}
        />
        <button
          type="button"
          className="btn w-full flex items-center justify-center gap-2"
          style={{ background: "var(--accent)", color: "#111" }}
          disabled={isGenerating || !prompt.trim() || !imageFile}
          onClick={() => void handleGenerate()}
        >
          {isGenerating ? <FaSpinner className="animate-spin" /> : <FaImage />}
          {isGenerating ? "Generating..." : "Edit Image"}
        </button>
      </div>

      {usageLimitModal && (
        <UsageLimitModal
          kind={usageLimitModal}
          onClose={() => setUsageLimitModal(null)}
          onSelectPlan={goToSubscriptionPlan}
        />
      )}

      <MediaStudioModal
        view={modalView}
        mediaType="image"
        prompt={activePrompt}
        previewUrl={preview}
        resultUrl={resultUrl}
        onClose={() => setModalView(null)}
        onLogin={() => navigateTo("/profile", { mode: "login" })}
        onUpgrade={() => navigateTo("/subscription")}
        onDownload={() => void handleDownload()}
        onShare={() => void handleShare()}
      />
    </div>
  );
}
