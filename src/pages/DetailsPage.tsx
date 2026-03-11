import { useState, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getDiscoverItemById } from "../services/discoverService";
import { generateDiscoverArticle } from "../services/discoverArticleService";
import type { DiscoverArticle } from "../services/discoverArticleService";
import type { DiscoverItem } from "../types";
import { IoIosArrowBack } from "react-icons/io";

const TAG_COLORS: Record<string, string> = {
  Trending: "#ff6b6b",
  Hot: "#ff6b6b",
  New: "#51cf66",
  Breakthrough: "#51cf66",
  Research: "#339af0",
  Brief: "#845ef7",
  Explain: "#845ef7",
  Compare: "#ff922b",
  Popular: "#20c997",
  Default: "var(--accent)",
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS.Default;
}

export default function DetailsPage() {
  const { navigateTo, state: currentData, params } = useRouterNavigation();
  const [item, setItem] = useState<DiscoverItem | null>(null);
  const [article, setArticle] = useState<DiscoverArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Use params.id or fallback to URL path (handles direct/shared links before router hydrates)
      const itemId = params.id ?? (typeof window !== "undefined" && window.location.pathname.match(/^\/details\/([^/]+)/)?.[1]);
      let discovered: DiscoverItem | null = null;

      if (currentData?.item) {
        discovered = currentData.item;
      } else if (itemId) {
        try {
          discovered = await getDiscoverItemById(itemId);
        } catch { /* ignore */ }
      }

      if (!discovered) {
        setIsLoading(false);
        navigateTo("/discover");
        return;
      }
      setItem(discovered);

      try {
        const a = await generateDiscoverArticle(
          discovered.id,
          discovered.title,
          discovered.description || "",
          discovered.category || "General"
        );
        setArticle(a);
        setArticleError(null);
      } catch {
        setArticleError("Could not load article. Make sure the backend is running.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [currentData?.item, params.id, navigateTo]);

  const handleShare = async () => {
    const articleUrl = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share && item) {
      try {
        await navigator.share({
          title: item.title,
          text: item.description || "",
          url: articleUrl,
        });
      } catch { /* user cancelled */ }
    } else if (item && articleUrl) {
      await navigator.clipboard.writeText(`${articleUrl}\n\n${item.title}`);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    }
  };

  const handleAskAI = (query: string) => {
    navigateTo("/", { searchQuery: query, mode: "Research" });
  };

  const handleRetry = () => {
    if (!item) return;
    setArticleError(null);
    setIsLoading(true);
    generateDiscoverArticle(item.id, item.title, item.description || "", item.category || "General")
      .then(setArticle)
      .catch(() => setArticleError("Failed again. Make sure the backend is running."))
      .finally(() => setIsLoading(false));
  };

  if (isLoading) {
    return (
      <div className="container" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <div className="sub">Loading article…</div>
      </div>
    );
  }

  if (!item) return null;

  if (articleError) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="card" style={{ padding: 24, textAlign: "center", borderLeft: "3px solid #ff6b6b" }}>
          <div style={{ color: "#ff6b6b", fontSize: "var(--font-md)", marginBottom: 8 }}>⚠ {articleError}</div>
          <div className="sub" style={{ marginBottom: 16 }}>Start the backend with: npm run server:dev</div>
          <button className="btn" onClick={handleRetry} style={{ marginRight: 8 }}>Retry</button>
          <button className="btn-ghost" onClick={() => navigateTo("/discover")}>Back to Discover</button>
        </div>
      </div>
    );
  }

  if (!article) return null;

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button className="btn-ghost" onClick={() => navigateTo("/discover")} style={{ fontSize: "var(--font-md)" }}>
          <IoIosArrowBack size={22} /> Back
        </button>
        <button className="btn-ghost" onClick={handleShare} style={{ fontSize: "var(--font-md)" }}>
          {shareSuccess ? "✓ Copied!" : "Share"}
        </button>
      </div>

      {!imgError && (
        <div style={{ marginBottom: 20, borderRadius: 16, overflow: "hidden", position: "relative" }}>
          <img
            src={item.image}
            alt={item.alt}
            onError={() => setImgError(true)}
            style={{ display: "block", width: "100%", height: 200, objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 80,
              background: "linear-gradient(to top, var(--bg) 0%, transparent 100%)",
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 99,
              fontSize: "var(--font-xs)",
              fontWeight: 600,
              background: tagColor(item.tag) + "22",
              color: tagColor(item.tag),
              border: `1px solid ${tagColor(item.tag)}44`,
            }}
          >
            {item.tag}
          </span>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 99,
              fontSize: "var(--font-xs)",
              fontWeight: 500,
              background: "var(--input-bg)",
              color: "var(--sub-text)",
            }}
          >
            {item.category}
          </span>
          <span style={{ fontSize: "var(--font-xs)", color: "var(--sub-text)", marginLeft: "auto", alignSelf: "center" }}>
            {article.readTime}
          </span>
        </div>

        <h1 style={{ fontSize: "var(--font-xl)", fontWeight: 700, lineHeight: 1.25, marginBottom: 8 }}>{item.title}</h1>
        <p style={{ color: "var(--sub-text)", lineHeight: 1.6, fontSize: "var(--font-md)" }}>{item.description}</p>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>Overview</div>
        <p style={{ lineHeight: 1.7, fontSize: "var(--font-md)", color: "var(--text)" }}>{article.overview}</p>
      </div>

      {article.keyFacts && article.keyFacts.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>Key Facts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {article.keyFacts.map((fact, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ minWidth: 22, height: 22, borderRadius: "50%", background: "var(--accent)", color: "#fff", fontSize: "var(--font-xs)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <p style={{ lineHeight: 1.6, fontSize: "var(--font-md)", margin: 0 }}>{fact}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {article.sections && article.sections.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {article.sections.map((section, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: "var(--font-lg)", fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>{section.title}</h2>
              <p style={{ lineHeight: 1.7, fontSize: "var(--font-md)", color: "var(--text)", margin: 0 }}>{section.content}</p>
            </div>
          ))}
        </div>
      )}

      <div
        className="card"
        style={{ padding: 16, marginBottom: 16, background: "linear-gradient(135deg, var(--accent)18, var(--accent)08)", border: "1px solid var(--accent)33", cursor: "pointer" }}
        onClick={() => handleAskAI(item.title)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22 }}>🔍</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "var(--font-md)", marginBottom: 2 }}>Deep dive with AI</div>
            <div style={{ fontSize: "var(--font-sm)", color: "var(--sub-text)" }}>Research "{item.title}" in depth</div>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 18 }}>→</div>
        </div>
      </div>

      {article.relatedTopics && article.relatedTopics.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>Related Topics</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {article.relatedTopics.map((topic, i) => (
              <button
                key={i}
                onClick={() => handleAskAI(topic)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 99,
                  border: "1px solid var(--border)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  fontSize: "var(--font-sm)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
