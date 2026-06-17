import { useState } from "react";
import { IoIosArrowBack } from "react-icons/io";
import { FaVideo, FaSpinner } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import { getUserData, isAuthenticated } from "../utils/auth";
import { generateVideoApi } from "../utils/mediaApi";
import {
  MediaStudioModal,
  type MediaStudioModalView,
} from "../components/MediaStudioModal";

const TEMPLATES = [
  { id: "cinematic", label: "Cinematic scene", prompt: "A cinematic drone shot over misty mountains at sunrise, golden light, 4K quality" },
  { id: "product", label: "Product showcase", prompt: "Smooth rotating product showcase on a minimalist white studio background with soft lighting" },
  { id: "nature", label: "Nature timelapse", prompt: "Timelapse of clouds moving over a lush green valley with birds flying across the sky" },
  { id: "abstract", label: "Abstract motion", prompt: "Abstract flowing liquid gold shapes morphing in slow motion on a dark background" },
  { id: "city", label: "City night", prompt: "Neon-lit city street at night with rain reflections and people walking with umbrellas" },
  { id: "space", label: "Space journey", prompt: "Camera flying through a colorful nebula with stars and distant planets" },
];

function hasVideoAccess(): boolean {
  const user = getUserData();
  if (!user) return false;
  const tier = user.premiumTier || "free";
  return Boolean(user.isPremium && (tier === "pro" || tier === "max"));
}

export default function CreateVideoPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [modalView, setModalView] = useState<MediaStudioModalView | null>(null);
  const [activePrompt, setActivePrompt] = useState("");

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) return;

    if (!isAuthenticated()) {
      setModalView("auth");
      return;
    }

    if (!hasVideoAccess()) {
      setModalView("upgrade");
      return;
    }

    setActivePrompt(text);
    setIsGenerating(true);
    setModalView("generating");
    setGeneratedUrl(null);

    try {
      const result = await generateVideoApi(text, 5, "16:9");
      setGeneratedUrl(result.url);
      setModalView("result");
      showToast({ message: "Video generated!", type: "success", duration: 3000 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Video generation failed";
      setModalView(null);
      if (message.toLowerCase().includes("pro") || message.toLowerCase().includes("subscription")) {
        setModalView("upgrade");
      } else {
        showToast({ message, type: "error", duration: 5000 });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedUrl) return;
    try {
      const response = await fetch(generatedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-video-${Date.now()}.mp4`;
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
            <div className="h3 mb-0">Create Video</div>
            <div className="sub text-sm opacity-70">Describe a scene to generate</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="sub text-sm font-semibold mb-3 uppercase tracking-wide opacity-70">Templates</div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPrompt(t.prompt)}
              className="glass-card border border-[var(--border)] rounded-xl p-4 text-left hover:border-[var(--accent)] transition-colors"
            >
              <FaVideo size={18} className="text-[var(--accent)] mb-2" />
              <div className="text-sm font-semibold mb-1">{t.label}</div>
              <div className="text-xs opacity-60 line-clamp-2">{t.prompt}</div>
            </button>
          ))}
        </div>

        {generatedUrl && !modalView && (
          <div className="glass-card border border-[var(--border)] rounded-xl overflow-hidden mb-6">
            <video src={generatedUrl} controls playsInline className="w-full max-h-[300px] object-contain bg-black" />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border)] sticky bottom-0 bg-[var(--bg)]" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to create..."
          className="w-full glass-panel border border-[var(--border)] rounded-xl p-3 text-[var(--text)] bg-transparent resize-none min-h-[80px] mb-3 outline-none"
          rows={3}
        />
        <button
          type="button"
          className="btn w-full flex items-center justify-center gap-2"
          style={{ background: "var(--accent)", color: "#111" }}
          disabled={isGenerating || !prompt.trim()}
          onClick={() => void handleGenerate()}
        >
          {isGenerating ? <FaSpinner className="animate-spin" /> : <FaVideo />}
          {isGenerating ? "Generating..." : "Generate Video"}
        </button>
      </div>

      <MediaStudioModal
        view={modalView}
        mediaType="video"
        prompt={activePrompt}
        resultUrl={generatedUrl}
        onClose={() => setModalView(null)}
        onLogin={() => navigateTo("/profile", { mode: "login" })}
        onUpgrade={() => navigateTo("/subscription")}
        onDownload={() => void handleDownload()}
      />
    </div>
  );
}
