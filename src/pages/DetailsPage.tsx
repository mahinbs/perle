import { useState, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getDiscoverItemById } from "../services/discoverService";
import type { DiscoverItem } from "../types";

export default function DetailsPage() {
  const { navigateTo, state: currentData, params } = useRouterNavigation();
  const [item, setItem] = useState<DiscoverItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchItem = async () => {
      // Get item from URL parameter or state
      const itemId = params.id;

      if (currentData?.item) {
        // Item passed via state (from navigation)
        setItem(currentData.item);
        setIsLoading(false);
        return;
      }

      if (itemId) {
        // Item ID from URL parameter - fetch from API
        try {
          const foundItem = await getDiscoverItemById(itemId);
          if (foundItem) {
            setItem(foundItem);
            setIsLoading(false);
          } else {
            // If no item found, navigate back to discover
            navigateTo("/discover");
          }
        } catch (error) {
          console.error('Failed to fetch item:', error);
          navigateTo("/discover");
        }
      } else {
        // No item ID, navigate back
        navigateTo("/discover");
      }
    };

    fetchItem();
  }, [currentData, params.id, navigateTo]);

  const handleBack = () => {
    navigateTo("/discover");
  };


  const handleBookmark = () => {
    // In a real app, this would save to user's library
    console.log("Bookmarking item:", item?.title);
    // You could add a toast notification here
  };

  const handleShare = async () => {
    if (navigator.share && item) {
      try {
        await navigator.share({
          title: item.title,
          text: item.description,
          url: window.location.href,
        });
      } catch (err) {
        console.log("Error sharing:", err);
      }
    } else {
      // Fallback: copy to clipboard
      if (item) {
        await navigator.clipboard.writeText(
          `${item.title}\n${item.description}`
        );
        console.log("Copied to clipboard");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="h3">Loading...</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="container">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="h3">Item not found</div>
          <button
            className="btn"
            onClick={handleBack}
            style={{ marginTop: 16 }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

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
        <button
          className="btn-ghost"
          onClick={handleBack}
          style={{ fontSize: "var(--font-md)" }}
        >
          ← Back
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn-ghost"
            onClick={handleBookmark}
            style={{ padding: 8, fontSize: "var(--font-lg)" }}
            aria-label="Bookmark"
          >
            🔖
          </button>
          <button
            className="btn-ghost"
            onClick={handleShare}
            style={{ padding: 8, fontSize: "var(--font-lg)" }}
            aria-label="Share"
          >
            📤
          </button>
        </div>
      </div>

      {/* Hero Image */}
      <div
        className="card details-hero"
        style={{ padding: 0, marginBottom: 20 }}
      >
        <img
          src={item.image}
          alt={item.alt}
          style={{
            display: "block",
            width: "100%",
            height: 200,
            objectFit: "cover",
          }}
        />
      </div>

      {/* Content */}
      <div
        className="card details-content"
        style={{ padding: 20, marginBottom: 20 }}
      >
        <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
          <span className="chip" style={{ fontSize: "var(--font-sm)", marginRight: 12 }}>
            {item.tag}
          </span>
          <span className="sub text-sm">{item.category}</span>
        </div>

        <div className="h1" style={{ marginBottom: 12 }}>
          {item.title}
        </div>

        <div className="text-lg" style={{ marginBottom: 20, lineHeight: 1.6 }}>
          {item.description}
        </div>
      </div>

      {/* Additional Details */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="h3" style={{ marginBottom: 16 }}>
          About This Topic
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Category</div>
          <div className="sub">{item.category}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Type</div>
          <div className="sub">{item.tag}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Description</div>
          <div className="sub" style={{ lineHeight: 1.5 }}>
            {item.description}
          </div>
        </div>
      </div>

      {/* Related Topics */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="h3" style={{ marginBottom: 16 }}>
          Related Topics
        </div>

        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {[
            "Research Methods",
            "Case Studies",
            "Best Practices",
            "Latest Trends",
            "Expert Insights",
          ].map((topic) => (
            <span key={topic} className="chip" style={{ fontSize: "var(--font-sm)" }}>
              {topic}
            </span>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="details-actions">
        <div className="row" style={{ gap: 12 }}>
          <button
            className="btn-ghost"
            onClick={handleBookmark}
            style={{ flex: 1 }}
          >
            📚 Add to Library
          </button>
          <button
            className="btn-ghost"
            onClick={handleShare}
            style={{ flex: 1 }}
          >
            📤 Share
          </button>
        </div>
      </div>

      <div className="spacer-40" />
    </div>
  );
}
