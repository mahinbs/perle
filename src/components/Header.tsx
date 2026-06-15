import React, { useEffect, useState } from "react";
import { FaUserCircle } from "react-icons/fa";
import { Link, useLocation } from "react-router-dom";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getAllDiscoverItems } from "../services/discoverService";
import type { DiscoverItem } from "../types";

export const Header: React.FC = () => {
  const { navigateTo } = useRouterNavigation();
  const location = useLocation();
  const [previewItems, setPreviewItems] = useState<DiscoverItem[]>([]);

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    getAllDiscoverItems()
      .then((items) => setPreviewItems(Array.isArray(items) ? items.slice(0, 2) : []))
      .catch(() => setPreviewItems([]));
  }, []);

  const img1 = previewItems[0]?.image;
  const img2 = previewItems[1]?.image;

  return (
    <>
      <header
        className="row header-container !gap-3"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          paddingBlock: "8px",
          flexWrap: "nowrap",
        }}
      >
        <div
          className="row header-left items-center justify-between w-full"
          style={{
            gap: "clamp(2px, 1vw, 12px)",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <div className="flex items-center min-w-0" style={{ gap: "clamp(2px, 1vw, 12px)", flexShrink: 0 }}>
            <button
              type="button"
              className="glass-button !font-bold font-ubuntu dark:border-yellow-300/25 rounded-lg px-2 md:px-3 text-[14px] md:text-[14px] h-[32px] md:h-[40px] flex items-center justify-center cursor-pointer whitespace-nowrap"
              onClick={() => navigateTo("/ai-friend")}
              aria-label="AI Friend"
            >
              AI Friend
            </button>

            <button
              type="button"
              className="glass-button !font-bold font-ubuntu dark:border-yellow-300/25 rounded-lg px-2 md:px-3 text-[14px] md:text-[14px] h-[32px] md:h-[40px] flex items-center justify-center cursor-pointer whitespace-nowrap"
              onClick={() => navigateTo("/ai-psychology")}
              aria-label="AI Psychology"
            >
              AI Psychology
            </button>
          </div>
          <div
            className="flex items-center shrink-0 header-actions-right"
            style={{ gap: 20, marginLeft: 8 }}
          >
            <Link
              to="/discover"
              className={`discover-header-btn ${isActive("/discover") ? "discover-header-btn--active" : ""}`}
              aria-label="Discover"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="discover-preview-stack">
                {img1 ? (
                  <img
                    src={img1}
                    alt="Discover preview"
                    className="discover-preview-img discover-preview-img--back"
                    draggable={false}
                  />
                ) : null}
                {img2 ? (
                  <img
                    src={img2}
                    alt="Discover preview"
                    className="discover-preview-img discover-preview-img--front"
                    draggable={false}
                  />
                ) : null}
                {!img1 && !img2 ? (
                  <span className="discover-preview-fallback text-xs text-[var(--accent)] font-semibold">
                    Discover
                  </span>
                ) : null}
              </span>
            </Link>
            <button
              type="button"
              className={`header-profile-btn btn-ghost glass-button flex items-center justify-center rounded-xl ${isActive("/profile") ? "active" : ""}`}
              onClick={() => navigateTo("/profile")}
              aria-label="Profile"
              style={{
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                position: "relative",
                zIndex: 1,
              }}
            >
              <FaUserCircle className="header-profile-icon" />
            </button>
          </div>
        </div>
      </header>
      <style>
        {`
          .header-actions-right {
            position: relative;
            z-index: 5;
          }

          .discover-header-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 3.5rem;
            min-height: 2.75rem;
            padding: 4px 6px;
            margin: 0;
            border: none;
            background: transparent !important;
            box-shadow: none !important;
            text-decoration: none;
            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            position: relative;
            z-index: 10;
            flex-shrink: 0;
          }

          .discover-header-btn--active .discover-preview-img {
            border-color: var(--accent);
          }

          .discover-preview-stack {
            position: relative;
            width: 3.25rem;
            height: 2.25rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
          }

          .discover-preview-img {
            position: absolute;
            width: 1.75rem;
            height: 2.1rem;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid var(--border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            transition: transform 0.2s ease;
            pointer-events: none;
            user-select: none;
          }

          .discover-preview-img--back {
            transform: rotate(-7deg) translateX(-8px);
            z-index: 1;
            opacity: 0.92;
          }

          .discover-preview-img--front {
            transform: rotate(8deg) translateX(8px);
            z-index: 2;
          }

          .discover-header-btn:active .discover-preview-img--back {
            transform: rotate(-7deg) translateX(-8px) scale(0.96);
          }

          .discover-header-btn:active .discover-preview-img--front {
            transform: rotate(8deg) translateX(8px) scale(0.96);
          }

          .discover-preview-fallback {
            pointer-events: none;
          }

          .header-profile-btn {
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0 !important;
            flex-shrink: 0;
          }

          .header-profile-icon {
            width: 30px;
            height: 30px;
            flex-shrink: 0;
          }

          @media (min-width: 768px) {
            .header-profile-btn {
              width: 48px;
              height: 48px;
              min-width: 48px;
              min-height: 48px;
            }

            .header-profile-icon {
              width: 34px;
              height: 34px;
            }
          }

          .header-container {
            min-height: auto !important;
          }
          
          @media (max-width: 768px) {
            .header-container {
              padding-block: 8px !important;
              gap: 8px !important;
            }
            
            .header-left {
              gap: 6px !important;
            }
          }
        `}
      </style>
    </>
  );
};
