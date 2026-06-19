import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { IoIosArrowBack } from "react-icons/io";
import { FaImage, FaVideo, FaSpinner, FaTimes, FaPlus, FaArrowUp, FaDownload } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import { getUserData, isAuthenticated } from "../utils/auth";
import { generateImageApi, generateVideoApi } from "../utils/mediaApi";
import type { UploadedFile } from "../types";
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

const VIDEO_TEMPLATES = [
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
      if (file.size > 10 * 1024 * 1024) {
        showToast({ message: `${file.name} must be under 10MB`, type: "error", duration: 3000 });
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

    if (!isAuthenticated()) {
      setModalView("auth");
      return;
    }

    if (mediaMode === "video" && !hasVideoAccess()) {
      setModalView("upgrade");
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
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${type}-${Date.now()}.${type === "image" ? "png" : "mp4"}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      showToast({ message: "Download failed", type: "error", duration: 3000 });
    }
  };

  return (
    <div className="container h-screen flex flex-col !p-0">
      <div
        className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]"
        style={{ paddingTop: "var(--safe-area-top)" }}
      >
        <div className="flex items-center gap-3 p-4">
          <button
            className="btn-ghost glass-button p-2!"
            onClick={() => navigateTo("/")}
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

      <div ref={conversationScrollRef} className="flex-1 overflow-y-auto overflow-anchor-none overflow-x-hidden px-4 py-5 flex flex-col">
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
                    className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)]"
                    style={{ background: "var(--card)" }}
                  >
                    <span className="text-xs opacity-60">
                      {entry.type === "image" ? "Generated image" : "Generated video"}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost glass-button flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
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
      </div>

      <div
        className="px-4 pt-2 sticky bottom-0 bg-[var(--bg)] input-bar-safe-bottom"
      >
        <div
          className="glass-card border border-[var(--border)] rounded-[28px] p-4 shadow-lg"
          style={{ background: "var(--bg)" }}
        >
          {/* Top row: + attach & prompt */}
          <div className="flex items-start gap-3 mb-4">
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

          {/* Bottom row: mode toggle, submit */}
          <div className="flex items-center justify-between gap-3">
            <div
              className="flex items-center rounded-full p-1 shrink-0"
              style={{ background: "var(--input-bg)" }}
            >
              <button
                type="button"
                onClick={() => setMediaMode("image")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                style={{
                  background: mediaMode === "image" ? "var(--card)" : "transparent",
                  color: mediaMode === "image" ? "var(--text)" : "var(--sub)",
                  boxShadow: mediaMode === "image" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <FaImage size={13} />
                Image
              </button>
              <button
                type="button"
                onClick={() => setMediaMode("video")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                style={{
                  background: mediaMode === "video" ? "var(--card)" : "transparent",
                  color: mediaMode === "video" ? "var(--text)" : "var(--sub)",
                  boxShadow: mediaMode === "video" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <FaVideo size={13} />
                Video
              </button>
            </div>

            <div className="flex items-center gap-2">
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
