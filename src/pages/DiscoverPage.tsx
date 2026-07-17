import { useState, useEffect, useRef } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import {
  getAllDiscoverItems,
  DISCOVER_CATEGORIES,
  filterByDiscoverCategory,
  getForYouNews,
  isRealDiscoverImage,
  type DiscoverCategory,
} from "../services/discoverService";
import type { DiscoverItem } from "../types";
import { IoIosArrowBack } from "react-icons/io";

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
  onImageBroken,
  hideNationLabel = false,
}: {
  item: DiscoverItem;
  onClick: () => void;
  onImageBroken: (id: string) => void;
  hideNationLabel?: boolean;
}) {
  const cleanDesc = sanitizeCardDescription(item.description);
  if (!isRealDiscoverImage(item.image)) return null;

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
          src={item.image}
          alt={item.alt || item.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => onImageBroken(item.id)}
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
  // Show 15 cards first; "See more" reveals the next batch.
  const INITIAL_VISIBLE = 15;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  // Cards whose publisher image failed to load — remove them (no Unsplash placeholders).
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const selectCategory = (category: DiscoverCategory, tabEl?: HTMLElement | null) => {
    setSelectedCategory(category);
    setVisibleCount(INITIAL_VISIBLE);
    // Scroll the horizontal tabs so the active pill sits at the leading edge.
    const container = tabsScrollRef.current;
    if (container && tabEl) {
      const nextLeft = Math.max(0, tabEl.offsetLeft - 8);
      container.scrollTo({ left: nextLeft, behavior: "smooth" });
    }
  };

  const loadItems = async (forceRefresh = false) => {
    setIsLoading(true);
    setFetchError(null);
    setBrokenImageIds(new Set());
    try {
      const items = await getAllDiscoverItems(forceRefresh);
      const realOnly = (Array.isArray(items) ? items : []).filter((i) =>
        isRealDiscoverImage(i.image)
      );
      console.log(`[DiscoverPage] loaded ${realOnly.length} items with real images (from ${items?.length ?? 0})`);
      setDiscoverItems(realOnly);
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

  // Reset pagination when switching tabs or search.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [selectedCategory, searchQuery]);

  const matchesSearch = (item: DiscoverItem) =>
    searchQuery === "" ||
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.description &&
      item.description.toLowerCase().includes(searchQuery.toLowerCase()));

  const categoryItems = filterByDiscoverCategory(
    discoverItems,
    selectedCategory
  )
    .filter(matchesSearch)
    .filter((i) => isRealDiscoverImage(i.image) && !brokenImageIds.has(i.id));

  const forYouItems = getForYouNews(categoryItems).filter(
    (i) => isRealDiscoverImage(i.image) && !brokenImageIds.has(i.id)
  );

  const sectionItems =
    selectedCategory === "For You" ? forYouItems : categoryItems;
  const visibleItems = sectionItems.slice(0, visibleCount);
  const hasMore = sectionItems.length > visibleCount;
  const remaining = Math.max(0, sectionItems.length - visibleCount);

  const handleSeeMore = () => {
    setVisibleCount((prev) =>
      Math.min(prev + INITIAL_VISIBLE, sectionItems.length)
    );
  };

  const handleImageBroken = (id: string) => {
    setBrokenImageIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleItemClick = (item: DiscoverItem) => {
    navigateTo(`/details/${item.id}`, { item });
  };

  return (
    <div
      className="discover-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        width: "100%",
      }}
    >
      {/* Sticky header: title, search, category tabs */}
      <div
        className="discover-sticky-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          paddingTop: "var(--safe-area-top)",
        }}
      >
        <div
          className="container"
          style={{
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 16,
            paddingRight: 16,
            boxSizing: "border-box",
            width: "100%",
          }}
        >
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div className="h1" style={{ margin: 0 }}>
              Discover
            </div>
            <button
              className="btn-ghost glass-button"
              onClick={() => navigateTo("/app")}
              style={{ fontSize: "var(--font-md)" }}
              aria-label="Back"
            >
              <IoIosArrowBack size={24} /> Back
            </button>
          </div>

          <div
            className="glass-card"
            style={{ padding: 12, marginBottom: 12, width: "100%" }}
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

          <div
            ref={tabsScrollRef}
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 2,
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              scrollBehavior: "smooth",
            }}
            className="no-scrollbar"
          >
            {DISCOVER_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`pill shrink-0 ${category === selectedCategory ? "active" : ""}`}
                onClick={(e) => selectCategory(category, e.currentTarget)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable news cards only */}
      <div
        className="discover-scroll-body container no-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          paddingTop: 16,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: "max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        {isLoading && (
          <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
            <div className="sub">Loading discover items...</div>
          </div>
        )}

        {!isLoading && sectionItems.length > 0 && (
          <>
            {selectedCategory !== "For You" && (
              <div className="sub text-sm" style={{ marginBottom: 16 }}>
                {sectionItems.length}{" "}
                {sectionItems.length === 1 ? "result" : "results"} found
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {visibleItems.map((item) => (
                <DiscoverCard
                  key={item.id}
                  item={item}
                  onClick={() => handleItemClick(item)}
                  onImageBroken={handleImageBroken}
                  hideNationLabel={selectedCategory === "For You"}
                />
              ))}
            </div>

            {hasMore && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 24,
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  className="btn glass-button"
                  onClick={handleSeeMore}
                  style={{
                    padding: "10px 28px",
                    borderRadius: 999,
                    fontWeight: 600,
                    fontSize: "var(--font-md)",
                    cursor: "pointer",
                    touchAction: "manipulation",
                  }}
                >
                  See more
                  <span
                    className="sub"
                    style={{ marginLeft: 8, fontWeight: 500, opacity: 0.8 }}
                  >
                    ({remaining} more)
                  </span>
                </button>
              </div>
            )}
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
      </div>
    </div>
  );
}
