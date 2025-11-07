import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getAllDiscoverItems } from "../services/discoverService";
import type { DiscoverItem } from "../types";

// Use the DiscoverItem type from the types file

// Get discover items from service
const discoverItems = getAllDiscoverItems();

export default function DiscoverPage() {
  const { navigateTo } = useRouterNavigation();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = ["All", "Technology", "Environment", "Science", "Sports"];

  const filteredItems = discoverItems.filter((item) => {
    const matchesCategory =
      selectedCategory === "All" || item.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleItemClick = (item: DiscoverItem) => {
    // Navigate to details page with specific item data
    navigateTo(`/details/${item.id}`, { item });
  };

  return (
    <div className="container">
      {/* Header */}
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
          className="btn-ghost"
          onClick={() => navigateTo("/")}
          style={{ fontSize: "var(--font-md)" }}
        >
          ← Back
        </button>
      </div>

      {/* Search Bar */}
      <div
        className="card"
        style={{ padding: 16, marginBottom: 20, width: "100%" }}
      >
        <input
          className="input"
          placeholder="Search topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ fontSize: "var(--font-md)" }}
        />
      </div>

      {/* Category Filter */}
      <div className="row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {categories.map((category) => (
          <button
            key={category}
            className={`pill ${category === selectedCategory ? "active" : ""}`}
            onClick={() => setSelectedCategory(category)}
            style={{ marginBottom: 8 }}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Results Count */}
      <div className="sub text-sm" style={{ marginBottom: 16 }}>
        {filteredItems.length}{" "}
        {filteredItems.length === 1 ? "result" : "results"} found
      </div>

      {/* Discover Items Grid */}
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        }}
      >
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="card"
            style={{
              padding: 0,
              overflow: "hidden",
              cursor: "pointer",
            }}
            onClick={() => handleItemClick(item)}
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
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {item.title}
              </div>
              <div
                className="sub text-sm"
                style={{ marginBottom: 8, lineHeight: "18px" }}
              >
                {item.description}
              </div>
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="chip" style={{ fontSize: "var(--font-sm)" }}>
                  {item.tag}
                </span>
                <span className="sub text-sm">{item.category}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
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
