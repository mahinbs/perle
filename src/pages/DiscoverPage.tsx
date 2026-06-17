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

function DiscoverCard({
  item,
  onClick,
  hideNationLabel = false,
}: {
  item: DiscoverItem;
  onClick: () => void;
  hideNationLabel?: boolean;
}) {
  return (
    <div
      className="glass-card"
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        width: "100%",
      }}
      onClick={onClick}
    >
      <img
        src={item.image}
        alt={item.alt}
        style={{
          display: "block",
          width: "100%",
          height: 140,
          objectFit: "cover",
        }}
      />
      <div style={{ padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
        <div
          className="sub text-sm"
          style={{ marginBottom: 8, lineHeight: "18px" }}
        >
          {item.description}
        </div>
        <div
          className="row"
          style={{
            justifyContent: hideNationLabel ? "flex-start" : "space-between",
            alignItems: "center",
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

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const items = await getAllDiscoverItems();
        setDiscoverItems(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("Failed to fetch discover items:", error);
        setDiscoverItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchItems();
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
        <button
          className="btn-ghost glass-button"
          onClick={() => navigateTo("/")}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
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
              No results found
            </div>
            <div className="sub">
              Try adjusting your search or category filter
            </div>
          </div>
        )}

      <div className="spacer-40" />
    </div>
  );
}
