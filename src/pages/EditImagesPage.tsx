import { useState, useRef } from "react";
import { IoIosArrowBack } from "react-icons/io";
import { FaImage, FaSpinner, FaTimes } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import { isAuthenticated } from "../utils/auth";
import { generateImageApi } from "../utils/mediaApi";
import {
  MediaStudioModal,
  type MediaStudioModalView,
} from "../components/MediaStudioModal";

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

  const handleFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast({ message: "Image must be under 10MB", type: "error", duration: 3000 });
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

    if (!isAuthenticated()) {
      setModalView("auth");
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
      showToast({ message: "Image edited!", type: "success", duration: 3000 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Image edit failed";
      setModalView(null);
      showToast({ message, type: "error", duration: 4000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    try {
      const response = await fetch(resultUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edited-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast({ message: "Download failed", type: "error", duration: 3000 });
    }
  };

  return (
    <div className="container h-screen flex flex-col !p-0">
      <div className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="flex items-center gap-3 p-4">
          <button className="btn-ghost glass-button p-2!" onClick={() => navigateTo("/")} aria-label="Back">
            <IoIosArrowBack size={24} />
          </button>
          <div>
            <div className="h3 mb-0">Edit Images</div>
            <div className="sub text-sm opacity-70">Upload and transform with AI</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {!preview ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full glass-card border-2 border-dashed border-[var(--border)] rounded-xl p-10 flex flex-col items-center gap-3 mb-6 hover:border-[var(--accent)] transition-colors"
          >
            <FaImage size={32} className="text-[var(--accent)]" />
            <div className="text-sm font-semibold">Upload an image to edit</div>
            <div className="text-xs opacity-60">PNG, JPG, WebP — up to 10MB</div>
          </button>
        ) : (
          <div className="relative mb-6 inline-block w-full">
            <img src={preview} alt="Upload preview" className="w-full max-h-[220px] object-contain rounded-xl border border-[var(--border)]" />
            <button
              type="button"
              className="absolute top-2 right-2 btn-ghost glass-button p-2 rounded-full"
              onClick={() => { setPreview(null); setImageFile(null); setResultUrl(null); }}
              aria-label="Remove image"
            >
              <FaTimes size={14} />
            </button>
          </div>
        )}

        <div className="sub text-sm font-semibold mb-3 uppercase tracking-wide opacity-70">Edit templates</div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPrompt(t.prompt)}
              className="glass-card border border-[var(--border)] rounded-xl p-4 text-left hover:border-[var(--accent)] transition-colors"
            >
              <div className="text-sm font-semibold mb-1">{t.label}</div>
              <div className="text-xs opacity-60 line-clamp-2">{t.prompt}</div>
            </button>
          ))}
        </div>

        {resultUrl && !modalView && (
          <div className="glass-card border border-[var(--border)] rounded-xl overflow-hidden mb-6">
            <img src={resultUrl} alt="Edited result" className="w-full object-contain" />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border)] sticky bottom-0 bg-[var(--bg)]" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
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
          {isGenerating ? "Editing..." : "Edit Image"}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

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
      />
    </div>
  );
}
