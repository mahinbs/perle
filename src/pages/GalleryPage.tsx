import { useState, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import { getAuthHeaders, isAuthenticated, removeAuthToken } from "../utils/auth";
import { IoIosArrowBack } from "react-icons/io";
import { FaImage, FaVideo, FaDownload, FaSpinner } from "react-icons/fa";

interface GeneratedMedia {
  id: string;
  media_type: "image" | "video";
  prompt: string;
  url: string;
  provider: string;
  width: number;
  height: number;
  aspect_ratio?: string;
  duration?: number;
  created_at: string;
  metadata?: any;
}

export default function GalleryPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const isLoggedIn = isAuthenticated();

  const [media, setMedia] = useState<GeneratedMedia[]>([]);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<GeneratedMedia | null>(null);

  useEffect(() => {
    // For logged-out users, show empty gallery (free user experience)
    if (!isLoggedIn) {
      setMedia([]);
      setIsLoading(false);
      return;
    }
    loadGallery();
  }, [isLoggedIn, filter]);

  const loadGallery = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    setIsLoading(true);
    try {
      const typeParam = filter !== "all" ? `&type=${filter}` : "";
      const response = await fetch(
        `${API_URL}/api/media/gallery?limit=100${typeParam}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      if (response.status === 401) {
        // User is logged out - clear auth and show free user experience
        removeAuthToken();
        setMedia([]);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setMedia(data.media || []);
      } else {
        const error = await response.json().catch(() => ({ error: "Failed to load gallery" }));
        showToast({
          message: error.error || "Failed to load gallery",
          type: "error",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Failed to load gallery:", error);
      showToast({
        message: "Failed to load gallery",
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (mediaItem: GeneratedMedia) => {
    try {
      const response = await fetch(mediaItem.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mediaItem.media_type}-${mediaItem.id}.${mediaItem.media_type === "image" ? "png" : "mp4"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast({
        message: "Download started",
        type: "success",
        duration: 2000,
      });
    } catch (error) {
      console.error("Download failed:", error);
      showToast({
        message: "Failed to download",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Show free user experience for logged-out users

  const filteredMedia = filter === "all" 
    ? media 
    : media.filter((m) => m.media_type === filter);

  return (
    <div className="container" style={{ minHeight: "100vh", padding: "16px" }}>
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/")}
          aria-label="Back"
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
        <div className="h1" style={{ margin: 0 }}>
          Gallery
        </div>
        <div style={{ width: 52 }} />
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          marginBottom: 24,
        }}
      >
        <button
          className={filter === "all" ? "btn" : "btn-ghost"}
          onClick={() => setFilter("all")}
          style={{
            borderBottom: filter === "all" ? "2px solid var(--accent)" : "none",
          }}
        >
          All ({media.length})
        </button>
        <button
          className={filter === "image" ? "btn" : "btn-ghost"}
          onClick={() => setFilter("image")}
          style={{
            borderBottom: filter === "image" ? "2px solid var(--accent)" : "none",
          }}
        >
          <FaImage size={14} style={{ marginRight: 6 }} />
          Images ({media.filter((m) => m.media_type === "image").length})
        </button>
        <button
          className={filter === "video" ? "btn" : "btn-ghost"}
          onClick={() => setFilter("video")}
          style={{
            borderBottom: filter === "video" ? "2px solid var(--accent)" : "none",
          }}
        >
          <FaVideo size={14} style={{ marginRight: 6 }} />
          Videos ({media.filter((m) => m.media_type === "video").length})
        </button>
      </div>

      {/* Gallery Grid */}
      {isLoading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "400px",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <FaSpinner size={32} className="animate-spin" />
          <div className="sub">Loading gallery...</div>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 48,
            textAlign: "center",
            marginTop: 24,
          }}
        >
          <div className="sub" style={{ fontSize: "var(--font-lg)" }}>
            {!isLoggedIn
              ? "Log in to view your generated media"
              : filter === "all"
              ? "No media generated yet"
              : filter === "image"
              ? "No images generated yet"
              : "No videos generated yet"}
          </div>
          <div className="sub text-sm" style={{ marginTop: 8, opacity: 0.7 }}>
            {!isLoggedIn
              ? "Generate images or videos and they'll appear here once you log in"
              : "Generate images or videos using the tools menu to see them here"}
          </div>
          {!isLoggedIn && (
            <button
              className="btn"
              onClick={() => navigateTo("/profile")}
              style={{ marginTop: 16 }}
            >
              Log In
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              className="card"
              style={{
                position: "relative",
                padding: 0,
                overflow: "hidden",
                cursor: "pointer",
                aspectRatio: item.aspect_ratio || (item.media_type === "image" ? "1/1" : "16/9"),
              }}
              onClick={() => setSelectedMedia(item)}
            >
              {item.media_type === "image" ? (
                <img
                  src={item.url}
                  alt={item.prompt}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <video
                  src={item.url}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  muted
                  loop
                  playsInline
                />
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                  padding: 12,
                  color: "white",
                }}
              >
                <div
                  className="text-sm"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginBottom: 4,
                  }}
                >
                  {item.prompt}
                </div>
                <div
                  className="text-xs"
                  style={{ opacity: 0.8 }}
                >
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(item);
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.6)",
                  color: "white",
                  padding: 8,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Download"
              >
                <FaDownload size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Media Detail Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="bg-[var(--card)] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h2 className="h2" style={{ margin: 0 }}>
                  {selectedMedia.media_type === "image" ? "Image" : "Video"}
                </h2>
                <button
                  className="btn-ghost"
                  onClick={() => setSelectedMedia(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div style={{ marginBottom: 16 }}>
                {selectedMedia.media_type === "image" ? (
                  <img
                    src={selectedMedia.url}
                    alt={selectedMedia.prompt}
                    style={{
                      width: "100%",
                      height: "auto",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                ) : (
                  <video
                    src={selectedMedia.url}
                    controls
                    style={{
                      width: "100%",
                      height: "auto",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div className="sub text-sm" style={{ marginBottom: 8 }}>
                  Prompt:
                </div>
                <div className="text-sm">{selectedMedia.prompt}</div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <div className="sub text-xs">
                  Created: {new Date(selectedMedia.created_at).toLocaleString()}
                </div>
                <div className="sub text-xs">
                  Provider: {selectedMedia.provider}
                </div>
                <div className="sub text-xs">
                  Size: {selectedMedia.width} × {selectedMedia.height}
                </div>
                {selectedMedia.duration && (
                  <div className="sub text-xs">
                    Duration: {selectedMedia.duration}s
                  </div>
                )}
              </div>
              <button
                className="btn"
                onClick={() => handleDownload(selectedMedia)}
                style={{ marginTop: 16, width: "100%" }}
              >
                <FaDownload size={14} style={{ marginRight: 8 }} />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

