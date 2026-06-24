import { useState, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import {
  getAllDiscoverItems,
  DISCOVER_CATEGORIES,
  filterByDiscoverCategory,
  getForYouNews,
  type DiscoverCategory,
} from "../services/discoverService";
import type { DiscoverItem } from "../types";
import { IoIosArrowBack } from "react-icons/io";

// Per-tag fallback pools — used ONLY when the article's own image fails to
// load (broken hot-link, blocked referrer, 404 from the publisher CDN). Each
// pool has 4 images so two stories in the same tag pick different photos via
// a stable hash on their id/title.
const TAG_FALLBACK_POOLS: Record<string, string[]> = {
  Tech: [
    "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&h=300&fit=crop",
  ],
  Politics: [
    "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1591189863430-ab87e120f312?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1575320181282-9afab399332c?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1604881991720-f91add269bed?w=600&h=300&fit=crop",
  ],
  Health: [
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1584982751601-97dcc096659c?w=600&h=300&fit=crop",
  ],
  Science: [
    "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1614935151651-0bea6508db6b?w=600&h=300&fit=crop",
  ],
  Environment: [
    "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1473773508845-188df298d2d1?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=600&h=300&fit=crop",
  ],
  Finance: [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1554260570-e9689a3418b8?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=600&h=300&fit=crop",
  ],
  Sports: [
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&h=300&fit=crop",
  ],
  News: [
    "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&h=300&fit=crop",
    "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&h=300&fit=crop",
  ],
};

function pickFallbackImage(tag: string | undefined, seed: string): string {
  const pool = TAG_FALLBACK_POOLS[tag || ""] || TAG_FALLBACK_POOLS.News;
  if (!seed) return pool[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

// Strip leftover markdown/scraped junk that may sneak in from raw Exa text.
function sanitizeCardDescription(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[#*_`~]/g, " ")
    .replace(/skip to (main )?content/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function DiscoverCard({
  item,
  onClick,
  hideNationLabel = false,
}: {
  item: DiscoverItem;
  onClick: () => void;
  hideNationLabel?: boolean;
}) {
  const cleanDesc = sanitizeCardDescription(item.description);
  const fallbackImage = pickFallbackImage(item.tag, item.id || item.title);
  return (
    <div
      className="glass-card"
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={onClick}
    >
      <div
        style={{
          width: "100%",
          height: 140,
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        <img
          src={item.image || fallbackImage}
          alt={item.alt || item.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== fallbackImage) {
              img.src = fallbackImage;
            }
          }}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.title}
        </div>
        {cleanDesc && (
          <div
            className="sub text-sm"
            style={{
              lineHeight: "18px",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {cleanDesc}
          </div>
        )}
        <div
          className="row"
          style={{
            justifyContent: hideNationLabel ? "flex-start" : "space-between",
            alignItems: "center",
            marginTop: "auto",
          }}
        >
          <span className="chip" style={{ fontSize: "var(--font-sm)" }}>
            {item.tag}
          </span>
          {!hideNationLabel && (
            <span className="sub text-sm">{item.category}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { navigateTo } = useRouterNavigation();
  const [discoverItems, setDiscoverItems] = useState<DiscoverItem[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<DiscoverCategory>("For You");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadItems = async (forceRefresh = false) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const items = await getAllDiscoverItems(forceRefresh);
      console.log(`[DiscoverPage] loaded ${items.length} items (`,
        items.filter((i) => i.category === 'For You' || i.nation).length,
        'news,', items.filter((i) => !i.nation && i.category !== 'For You').length, 'topics)');
      setDiscoverItems(Array.isArray(items) ? items : []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[DiscoverPage] fetch failed:", msg);
      setFetchError(msg);
      setDiscoverItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchesSearch = (item: DiscoverItem) =>
    searchQuery === "" ||
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.description &&
      item.description.toLowerCase().includes(searchQuery.toLowerCase()));

  const categoryItems = filterByDiscoverCategory(
    discoverItems,
    selectedCategory
  ).filter(matchesSearch);

  const forYouItems = getForYouNews(categoryItems);

  const handleItemClick = (item: DiscoverItem) => {
    navigateTo(`/details/${item.id}`, { item });
  };

  return (
    <div className="container">
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div className="h1">Discover</div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Refresh button removed — it bypassed the upstream news cache
              and let users hammer Exa/Gemini + the og:image scraper at
              will, which is an easy abuse surface. Server-side cache TTL
              already cycles fresh stories every few minutes; the next
              normal page open will see them. */}
          <button
            className="btn-ghost glass-button"
            onClick={() => navigateTo("/")}
            style={{ fontSize: "var(--font-md)" }}
          >
            <IoIosArrowBack size={24} /> Back
          </button>
        </div>
      </div>

      <div
        className="glass-card"
        style={{ padding: 16, marginBottom: 20, width: "100%" }}
      >
        <input
          className="input"
          placeholder="Search topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            fontSize: "var(--font-md)",
            width: "100%",
            borderRadius: ".5rem",
            paddingInline: 8,
          }}
        />
      </div>

      {/* Horizontally scrollable category pills */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          marginBottom: 20,
          paddingBottom: 4,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
        className="no-scrollbar"
      >
        {DISCOVER_CATEGORIES.map((category) => (
          <button
            key={category}
            className={`pill shrink-0 ${category === selectedCategory ? "active" : ""}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
          <div className="sub">Loading discover items...</div>
        </div>
      )}

      {!isLoading && selectedCategory === "For You" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {forYouItems.map((item) => (
            <DiscoverCard
              key={item.id}
              item={item}
              onClick={() => handleItemClick(item)}
              hideNationLabel
            />
          ))}
        </div>
      )}

      {!isLoading && selectedCategory !== "For You" && (
        <>
          <div className="sub text-sm" style={{ marginBottom: 16 }}>
            {categoryItems.length}{" "}
            {categoryItems.length === 1 ? "result" : "results"} found
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {categoryItems.map((item) => (
              <DiscoverCard
                key={item.id}
                item={item}
                onClick={() => handleItemClick(item)}
              />
            ))}
          </div>
        </>
      )}

      {!isLoading &&
        ((selectedCategory === "For You" && forYouItems.length === 0) ||
          (selectedCategory !== "For You" && categoryItems.length === 0)) && (
          <div
            className="glass-card"
            style={{ padding: 40, textAlign: "center" }}
          >
            <div className="h3" style={{ marginBottom: 8 }}>
              {selectedCategory === "For You" && discoverItems.length > 0
                ? "No news for your region yet"
                : "No results found"}
            </div>
            <div className="sub" style={{ marginBottom: 16 }}>
              {fetchError
                ? `Couldn't reach backend: ${fetchError}`
                : selectedCategory === "For You"
                ? "We're loading fresh headlines — try refreshing in a moment."
                : "Try adjusting your search or category filter"}
            </div>
            {(fetchError || selectedCategory === "For You") && (
              <button
                onClick={() => loadItems(true)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: "var(--font-sm)",
                  fontWeight: 500,
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

      <div className="spacer-40" />
    </div>
  );
}
