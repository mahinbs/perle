import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { IoIosArrowBack } from "react-icons/io";
import { FaImage, FaVideo, FaSpinner, FaTimes, FaPlus, FaArrowUp, FaDownload } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import {
  hasReachedLifetimeMediaLimit,
  incrementLifetimeMediaCount,
  shouldEnforceUsageLimits,
  type UsageLimitKind,
} from "../utils/queryLimit";
import { UsageLimitModal } from "../components/UsageLimitModal";
import { downloadMedia } from "../utils/downloadMedia";
import { generateImageApi, generateVideoApi, type ImageModelChoice } from "../utils/mediaApi";
import { getUserData } from "../utils/auth";
import type { UploadedFile } from "../types";
import { ProviderLogo } from "../components/ProviderLogos";
import {
  MediaStudioModal,
  type MediaStudioModalView,
} from "../components/MediaStudioModal";
import {
  CHAT_EXCHANGE_SCROLL_OFFSET,
  getActiveExchangeMinHeight,
  scrollExchangeToTop,
  useScrollViewportHeight,
} from "../utils/chatScroll";

type MediaMode = "image" | "video";
const MAX_ATTACHED_IMAGES = 5;

type ConversationEntry = {
  id: string;
  prompt: string;
  type: MediaMode;
  sourcePreview?: string | null;
  sourcePreviews?: string[];
  resultUrl?: string;
  status: "generating" | "done" | "error";
  error?: string;
};

const IMAGE_TEMPLATES = [
  { id: "portrait", label: "Portrait", prompt: "A cinematic portrait with soft golden hour lighting and shallow depth of field" },
  { id: "landscape", label: "Landscape", prompt: "A breathtaking mountain landscape at sunrise with mist in the valleys" },
  { id: "product", label: "Product shot", prompt: "A minimalist product photo on a clean white studio background with soft shadows" },
  { id: "enhance", label: "Enhance quality", prompt: "Enhance this image with sharper details, better lighting and vivid colors" },
  { id: "style", label: "Artistic style", prompt: "Transform this image into a watercolor painting style with soft brush strokes" },
  { id: "cartoon", label: "Cartoonify", prompt: "Convert this image into a vibrant cartoon illustration style" },
];

// Image-gen model picker — user-facing labels only (no internal pipeline names).
type ImageModelOption = {
  value: ImageModelChoice;
  label: string;
  provider: string;
  description: string;
};

const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    value: "auto",
    label: "Auto",
    provider: "SyntraIQ",
    description: "Best model for your prompt",
  },
  {
    value: "nano-banana",
    label: "Nano Banana",
    provider: "Google",
    description: "Vivid, creative images",
  },
  {
    value: "imagen-4",
    label: "Imagen 4",
    provider: "Google",
    description: "Photorealistic quality",
  },
  {
    value: "gpt-image-1",
    label: "GPT Image",
    provider: "OpenAI",
    description: "Strong text-to-image and edits",
  },
  {
    value: "grok-image",
    label: "Grok Imagine",
    provider: "xAI",
    description: "Fast, stylized images",
  },
];

const VIDEO_TEMPLATES = [
  { id: "cinematic", label: "Cinematic scene", prompt: "A cinematic drone shot over misty mountains at sunrise, golden light, 4K quality" },
  { id: "product", label: "Product showcase", prompt: "Smooth rotating product showcase on a minimalist white studio background with soft lighting" },
  { id: "nature", label: "Nature timelapse", prompt: "Timelapse of clouds moving over a lush green valley with birds flying across the sky" },
  { id: "abstract", label: "Abstract motion", prompt: "Abstract flowing liquid gold shapes morphing in slow motion on a dark background" },
  { id: "city", label: "City night", prompt: "Neon-lit city street at night with rain reflections and people walking with umbrellas" },
  { id: "space", label: "Space journey", prompt: "Camera flying through a colorful nebula with stars and distant planets" },
];

export default function MediaStudioPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollEntryIdRef = useRef<string | null>(null);
  const pendingScrollEntryElRef = useRef<HTMLDivElement | null>(null);
  const [mediaMode, setMediaMode] = useState<MediaMode>("image");
  const [prompt, setPrompt] = useState("");
  const [attachedImages, setAttachedImages] = useState<UploadedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [modalView, setModalView] = useState<MediaStudioModalView | null>(null);
  const [activePrompt, setActivePrompt] = useState("");
  const [modalResultUrl, setModalResultUrl] = useState<string | null>(null);
  const [activeSourcePreviews, setActiveSourcePreviews] = useState<string[]>([]);
  const [usageLimitModal, setUsageLimitModal] = useState<UsageLimitKind | null>(null);
  // Image model selection (premium only). Free users always run on 'auto'
  // and the backend silently picks the chain it can authenticate against.
  const [imageModel, setImageModel] = useState<ImageModelChoice>("auto");
  const [imageModelOpen, setImageModelOpen] = useState(false);
  const imageModelBtnRef = useRef<HTMLButtonElement>(null);
  const [imageModelMenuStyle, setImageModelMenuStyle] = useState<React.CSSProperties | null>(null);
  const isPremiumUser = Boolean(getUserData()?.isPremium);
  const selectedImageModelOption =
    IMAGE_MODEL_OPTIONS.find((o) => o.value === imageModel) ?? IMAGE_MODEL_OPTIONS[0];

  useLayoutEffect(() => {
    if (!imageModelOpen || !imageModelBtnRef.current) {
      setImageModelMenuStyle(null);
      return;
    }

    const updatePosition = () => {
      const btn = imageModelBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = Math.min(320, Math.max(280, rect.width + 40));
      const right = Math.max(12, window.innerWidth - rect.right);
      const bottom = Math.max(12, window.innerHeight - rect.top + 8);

      setImageModelMenuStyle({
        position: "fixed",
        right,
        bottom,
        width: menuWidth,
        maxHeight: "min(340px, 50vh)",
        overflowY: "auto",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        padding: 6,
        zIndex: 10050,
        WebkitOverflowScrolling: "touch",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [imageModelOpen]);

  useEffect(() => {
    if (!imageModelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageModelOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [imageModelOpen]);

  const goToSubscriptionPlan = (plan: "pro" | "max") => {
    setUsageLimitModal(null);
    navigateTo("/subscription", { plan, limitReached: true });
  };

  const hasStarted = conversation.length > 0;

  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "image" || mode === "video") {
      setMediaMode(mode);
    }
  }, [searchParams]);

  const scrollViewportHeight = useScrollViewportHeight(conversationScrollRef);
  const activeExchangeMinHeight = getActiveExchangeMinHeight(scrollViewportHeight);

  const pinActiveEntry = (target: HTMLElement | null) => {
    const container = conversationScrollRef.current;
    if (!container || !target) return;

    const minH = getActiveExchangeMinHeight(container.clientHeight);
    if (minH) {
      target.style.minHeight = `${minH}px`;
    }

    scrollExchangeToTop(container, target, { behavior: "auto" });
  };

  // ChatGPT-style UX: pin the new prompt + generation at the top of the scroll area.
  useLayoutEffect(() => {
    if (!isGenerating) return;
    if (!pendingScrollEntryIdRef.current) return;
    const el = pendingScrollEntryElRef.current;
    if (!el) return;

    pendingScrollEntryIdRef.current = null;
    pendingScrollEntryElRef.current = null;

    pinActiveEntry(el);
  }, [conversation.length, isGenerating]);

  const canSubmit = Boolean(prompt.trim()) && !isGenerating;

  const handleFiles = async (fileList: File[] | null) => {
    if (!fileList || fileList.length === 0) return;

    const remainingSlots = MAX_ATTACHED_IMAGES - attachedImages.length;
    if (remainingSlots <= 0) {
      showToast({
        message: `Maximum ${MAX_ATTACHED_IMAGES} images allowed`,
        type: "error",
        duration: 3000,
      });
      return;
    }

    const newAttachments: UploadedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 20 * 1024 * 1024) {
        showToast({ message: `${file.name} must be under 20 MB`, type: "error", duration: 3000 });
        continue;
      }
      if (newAttachments.length >= remainingSlots) break;

      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      newAttachments.push({
        id: `${Date.now()}-${i}-${Math.random()}`,
        file,
        type: "image",
        preview,
      });
    }

    if (newAttachments.length > 0) {
      setAttachedImages((prev) => [...prev, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const clearAttachments = () => {
    setAttachedImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) return;

    if (shouldEnforceUsageLimits() && hasReachedLifetimeMediaLimit()) {
      setUsageLimitModal("media");
      return;
    }

    const entryId = `entry-${Date.now()}`;
    const sourcePreviews = attachedImages.map((img) => img.preview || "").filter(Boolean);
    const attachedFiles = attachedImages.map((img) => img.file);
    setActivePrompt(text);
    setActiveSourcePreviews(sourcePreviews);
    pendingScrollEntryIdRef.current = entryId;
    setIsGenerating(true);
    setModalView("generating");
    setModalResultUrl(null);

    setConversation((prev) => [
      ...prev,
      {
        id: entryId,
        prompt: text,
        type: mediaMode,
        sourcePreviews,
        status: "generating",
      },
    ]);
    setPrompt("");
    clearAttachments();

    try {
      if (mediaMode === "image") {
        const result = await generateImageApi(
          text,
          "1:1",
          attachedFiles.length > 0 ? attachedFiles : undefined,
          isPremiumUser ? imageModel : "auto",
        );
        setModalResultUrl(result.url);
        setModalView("result");
        setConversation((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, status: "done", resultUrl: result.url } : e
          )
        );
        showToast({
          message: attachedFiles.length > 0 ? "Image edited!" : "Image generated!",
          type: "success",
          duration: 3000,
        });
        if (shouldEnforceUsageLimits()) {
          incrementLifetimeMediaCount();
        }
      } else {
        const result = await generateVideoApi(
          text,
          5,
          "16:9",
          attachedFiles.length > 0 ? attachedFiles : undefined,
        );
        setModalResultUrl(result.url);
        setModalView("result");
        setConversation((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, status: "done", resultUrl: result.url } : e
          )
        );
        showToast({ message: "Video generated!", type: "success", duration: 3000 });
        if (shouldEnforceUsageLimits()) {
          incrementLifetimeMediaCount();
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setModalView(null);
      setConversation((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: "error", error: message } : entry
        )
      );
      if (message.toLowerCase().includes("pro") || message.toLowerCase().includes("subscription")) {
        setModalView("upgrade");
      } else {
        showToast({ message, type: "error", duration: 5000 });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (url: string, type: MediaMode) => {
    try {
      const filename = `${type}-${Date.now()}.${type === "image" ? "png" : "mp4"}`;
      await downloadMedia(url, filename);
    } catch {
      showToast({ message: "Download failed", type: "error", duration: 3000 });
    }
  };

  return (
    <div className="container h-full flex flex-col !p-0">
      <div
        className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]"
        style={{ paddingTop: "var(--safe-area-top)" }}
      >
        <div className="flex items-center gap-3 p-4">
          <button
            className="btn-ghost glass-button p-2!"
            onClick={() => navigateTo("/app")}
            aria-label="Back"
          >
            <IoIosArrowBack size={24} />
          </button>
          <div>
            <div className="h3 mb-0">Create</div>
            <div className="sub text-sm opacity-70">
              Generate or edit images and videos with AI
            </div>
          </div>
        </div>
      </div>

      <div
        ref={conversationScrollRef}
        className="flex-1 overflow-y-auto overflow-anchor-none overflow-x-hidden px-4 pt-5 flex flex-col"
        style={{ paddingBottom: 8 }}
      >
        {!hasStarted && (
          <>
            <div className="sub text-sm font-semibold mb-3 uppercase tracking-wide opacity-70">
              Image templates
            </div>
            <div
              className="flex gap-3 mb-6 overflow-x-auto pb-2 no-scrollbar"
              style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
            >
              {IMAGE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setMediaMode("image"); setPrompt(t.prompt); }}
                  className="glass-card border border-[var(--border)] rounded-xl p-4 text-left hover:border-[var(--accent)] transition-colors shrink-0"
                  style={{ width: 200, scrollSnapAlign: "start" }}
                >
                  <FaImage size={16} className="text-[var(--accent)] mb-2" />
                  <div className="text-sm font-semibold mb-1">{t.label}</div>
                  <div className="text-xs opacity-60 line-clamp-2">{t.prompt}</div>
                </button>
              ))}
            </div>

            <div className="sub text-sm font-semibold mb-3 uppercase tracking-wide opacity-70">
              Video templates
            </div>
            <div
              className="flex gap-3 mb-6 overflow-x-auto pb-2 no-scrollbar"
              style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
            >
              {VIDEO_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setMediaMode("video"); setPrompt(t.prompt); }}
                  className="glass-card border border-[var(--border)] rounded-xl p-4 text-left hover:border-[var(--accent)] transition-colors shrink-0"
                  style={{ width: 200, scrollSnapAlign: "start" }}
                >
                  <FaVideo size={16} className="text-[var(--accent)] mb-2" />
                  <div className="text-sm font-semibold mb-1">{t.label}</div>
                  <div className="text-xs opacity-60 line-clamp-2">{t.prompt}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {conversation.map((entry, index) => {
          const isLastEntry = index === conversation.length - 1;

          return (
          <div
            key={entry.id}
            data-chat-exchange
            className="mb-6"
            style={{
              scrollMarginTop: CHAT_EXCHANGE_SCROLL_OFFSET,
              ...(isLastEntry && activeExchangeMinHeight
                ? { minHeight: activeExchangeMinHeight }
                : {}),
            }}
            ref={(el) => {
              if (entry.id === pendingScrollEntryIdRef.current) {
                pendingScrollEntryElRef.current = el;
              }
            }}
          >
            {(entry.sourcePreviews?.length || entry.sourcePreview) && (
              <div className="flex justify-end mb-2 gap-2 flex-wrap">
                {(entry.sourcePreviews?.length
                  ? entry.sourcePreviews
                  : entry.sourcePreview
                    ? [entry.sourcePreview]
                    : []
                ).map((src, index) => (
                  <img
                    key={`${entry.id}-src-${index}`}
                    src={src}
                    alt={`Attached ${index + 1}`}
                    className="max-w-[120px] max-h-[80px] object-cover rounded-lg border border-[var(--border)]"
                  />
                ))}
              </div>
            )}
            <div className="flex justify-end mb-2">
              <div className="glass-card border border-[var(--border)] rounded-2xl px-4 py-2 max-w-[85%] text-sm">
                {entry.prompt}
              </div>
            </div>
            <div className="w-full min-w-0">
              {entry.status === "generating" && (
                <div className="glass-card border border-[var(--border)] rounded-2xl p-6 flex items-center gap-3 w-fit">
                  <FaSpinner className="animate-spin text-[var(--accent)]" />
                  <span className="text-sm opacity-80">
                    {entry.type === "image" ? "Generating image…" : "Creating video…"}
                  </span>
                </div>
              )}
              {entry.status === "error" && (
                <div className="glass-card border border-red-500/40 rounded-2xl p-4 text-sm text-red-400 w-fit">
                  {entry.error || "Generation failed"}
                </div>
              )}
              {entry.status === "done" && entry.resultUrl && (
                <div
                  className="glass-card border border-[var(--border)] rounded-2xl overflow-hidden"
                  style={{ width: "100%", maxWidth: "100%" }}
                >
                  {entry.type === "image" ? (
                    <img
                      src={entry.resultUrl}
                      alt="Generated"
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        maxHeight: 360,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : (
                    <video
                      src={entry.resultUrl}
                      controls
                      playsInline
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        maxHeight: 360,
                        display: "block",
                        background: "#000",
                      }}
                    />
                  )}
                  <div
                    className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-[var(--border)]"
                    style={{ background: "var(--card)" }}
                  >
                    <span className="text-xs opacity-60 truncate min-w-0">
                      {entry.type === "image" ? "Generated image" : "Generated video"}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost glass-button flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shrink-0"
                      onClick={() => void handleDownload(entry.resultUrl!, entry.type)}
                      title="Download"
                    >
                      <FaDownload size={12} />
                      Download
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          );
        })}
        {/* Spacer so last result Download isn't hidden behind sticky input bar */}
        <div className="shrink-0" style={{ height: 24 }} aria-hidden />
      </div>

      <div
        className="px-3 sm:px-4 pt-2 sticky bottom-0 z-20 bg-[var(--bg)] input-bar-safe-bottom shrink-0"
      >
        <div
          className="glass-card border border-[var(--border)] rounded-[24px] sm:rounded-[28px] p-3 sm:p-4 shadow-lg"
          style={{ background: "var(--bg)" }}
        >
          {/* Top row: + attach & prompt */}
          <div className="flex items-start gap-2 sm:gap-3 mb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || attachedImages.length >= MAX_ATTACHED_IMAGES}
              aria-label="Attach images"
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
              style={{
                background: "var(--text)",
                color: "var(--bg)",
              }}
            >
              <FaPlus size={16} />
            </button>

            <div className="flex-1 min-w-0">
              {attachedImages.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {attachedImages.map((img) => (
                    <div key={img.id} className="relative inline-block">
                      <img
                        src={img.preview}
                        alt="Attachment"
                        className="h-14 w-14 object-cover rounded-xl border border-[var(--border)]"
                      />
                      <button
                        type="button"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "var(--text)", color: "var(--bg)" }}
                        onClick={() => removeAttachment(img.id)}
                        aria-label="Remove attachment"
                      >
                        <FaTimes size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSubmit) void handleGenerate();
                  }
                }}
                placeholder="Type to imagine"
                rows={2}
                disabled={isGenerating}
                className="w-full bg-transparent border-none outline-none resize-none text-[var(--text)] placeholder:text-[var(--sub)] min-h-[44px] text-[15px] leading-relaxed"
              />
            </div>
          </div>

          {/* Bottom row: mode toggle + optional model + send (send never wraps off-screen) */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex items-center rounded-full p-1 shrink-0 min-w-0"
              style={{ background: "var(--input-bg)" }}
            >
              <button
                type="button"
                onClick={() => setMediaMode("image")}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
                style={{
                  background: mediaMode === "image" ? "var(--card)" : "transparent",
                  color: mediaMode === "image" ? "var(--text)" : "var(--sub)",
                  boxShadow: mediaMode === "image" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <FaImage size={12} />
                Image
              </button>
              <button
                type="button"
                onClick={() => setMediaMode("video")}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
                style={{
                  background: mediaMode === "video" ? "var(--card)" : "transparent",
                  color: mediaMode === "video" ? "var(--text)" : "var(--sub)",
                  boxShadow: mediaMode === "video" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <FaVideo size={12} />
                Video
              </button>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0 relative min-w-0">
              {mediaMode === "image" && isPremiumUser && (
                <>
                  <button
                    ref={imageModelBtnRef}
                    type="button"
                    onClick={() => setImageModelOpen((o) => !o)}
                    aria-label="Image model"
                    aria-expanded={imageModelOpen}
                    aria-haspopup="listbox"
                    className="flex items-center gap-1 text-xs rounded-full px-2 py-1.5 outline-none border-none shrink min-w-0 max-w-[72px] sm:max-w-[140px]"
                    style={{ background: "var(--input-bg)", color: "var(--text)" }}
                  >
                    <ProviderLogo
                      provider={selectedImageModelOption.provider}
                      modelId={selectedImageModelOption.value === "auto" ? "auto" : undefined}
                      size={18}
                    />
                    <span className="font-medium truncate">
                      {selectedImageModelOption.label}
                    </span>
                    <span style={{ opacity: 0.6, fontSize: 10 }} aria-hidden>▾</span>
                  </button>
                  {imageModelOpen && imageModelMenuStyle &&
                    createPortal(
                      <>
                        <div
                          onClick={() => setImageModelOpen(false)}
                          style={{ position: "fixed", inset: 0, zIndex: 10040 }}
                          aria-hidden
                        />
                        <div role="listbox" aria-label="Image models" style={imageModelMenuStyle}>
                          <div
                            style={{
                              padding: "8px 10px 6px",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--text)",
                              borderBottom: "1px solid var(--border)",
                              marginBottom: 4,
                            }}
                          >
                            Image model
                          </div>
                          {IMAGE_MODEL_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              role="option"
                              aria-selected={imageModel === opt.value}
                              onClick={() => {
                                setImageModel(opt.value);
                                setImageModelOpen(false);
                              }}
                              className="w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-colors"
                              style={{
                                background: imageModel === opt.value ? "var(--input-bg)" : "transparent",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--input-bg)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background =
                                  imageModel === opt.value ? "var(--input-bg)" : "transparent";
                              }}
                            >
                              <ProviderLogo
                                provider={opt.provider}
                                modelId={opt.value === "auto" ? "auto" : undefined}
                                size={28}
                              />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "var(--text)",
                                  }}
                                >
                                  {opt.label}
                                </span>
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 11,
                                    color: "var(--sub)",
                                    lineHeight: 1.35,
                                    marginTop: 2,
                                  }}
                                >
                                  {opt.description}
                                </span>
                              </span>
                              {imageModel === opt.value && (
                                <span style={{ color: "var(--accent)", fontSize: 14, flexShrink: 0 }}>✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>,
                      document.body
                    )}
                </>
              )}
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!canSubmit}
                aria-label="Generate"
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
                style={{
                  background: canSubmit ? "var(--accent)" : "var(--input-bg)",
                  color: canSubmit ? "#111" : "var(--sub)",
                }}
              >
                {isGenerating ? (
                  <FaSpinner className="animate-spin" size={16} />
                ) : (
                  <FaArrowUp size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const input = e.target;
          const selected = input.files ? Array.from(input.files) : [];
          void handleFiles(selected).finally(() => {
            input.value = "";
          });
        }}
      />

      {usageLimitModal && (
        <UsageLimitModal
          kind={usageLimitModal}
          onClose={() => setUsageLimitModal(null)}
          onSelectPlan={goToSubscriptionPlan}
        />
      )}

      <MediaStudioModal
        view={modalView}
        mediaType={mediaMode}
        prompt={activePrompt}
        previewUrl={activeSourcePreviews[0] || null}
        resultUrl={modalResultUrl}
        onClose={() => setModalView(null)}
        onLogin={() => navigateTo("/profile", { mode: "login" })}
        onUpgrade={() => navigateTo("/subscription")}
        onDownload={
          modalResultUrl
            ? () => void handleDownload(modalResultUrl, mediaMode)
            : undefined
        }
      />
    </div>
  );
}
