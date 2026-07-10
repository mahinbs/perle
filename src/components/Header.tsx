import React, { useEffect, useState, useCallback } from "react";
import { FaEllipsisV } from "react-icons/fa";
import { IoIosArrowBack } from "react-icons/io";
import { Link, useLocation } from "react-router-dom";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getAllDiscoverItems } from "../services/discoverService";
import {
  getUserProfilePictureUrl,
  getUserAvatarFallbackUrl,
  onAuthChange,
  isLoggedIn,
  setUserData,
  authFetch,
} from "../utils/auth";
import { onStorageChange } from "../utils/storage";
import type { DiscoverItem } from "../types";

interface HeaderProps {
  onOpenSidebar?: () => void;
  /** Show a back arrow instead of the mobile sidebar toggle (e.g. Analyze Doc page). */
  showBackButton?: boolean;
  backTo?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSidebar,
  showBackButton = false,
  backTo = "/app",
}) => {
  const { navigateTo } = useRouterNavigation();
  const location = useLocation();
  const [previewItems, setPreviewItems] = useState<DiscoverItem[]>([]);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(() =>
    getUserProfilePictureUrl()
  );

  const refreshProfileImage = useCallback(() => {
    setProfileImageUrl(getUserProfilePictureUrl());
  }, []);

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    const updateDiscoverItems = () => {
      getAllDiscoverItems()
        .then((items) => {
          const withImages = (Array.isArray(items) ? items : []).filter((i) =>
            typeof i.image === "string" &&
            /^https?:\/\//i.test(i.image) &&
            !i.image.startsWith("data:") &&
            !/images\.unsplash\.com/i.test(i.image)
          );
          setPreviewItems(withImages.slice(0, 2));
        })
        .catch(() => setPreviewItems([]));
    };

    updateDiscoverItems();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateDiscoverItems();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname]);

  useEffect(() => {
    refreshProfileImage();
    const offAuth = onAuthChange(refreshProfileImage);
    const offStorage = onStorageChange(refreshProfileImage);
    return () => {
      offAuth();
      offStorage();
    };
  }, [refreshProfileImage]);

  useEffect(() => {
    if (!isLoggedIn() || getUserProfilePictureUrl()) return;

    const API_URL = import.meta.env.VITE_API_URL as string | undefined;
    if (!API_URL) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await authFetch(`${API_URL}/api/profile`);
        if (!response.ok || cancelled) return;
        const profile = await response.json();
        if (cancelled) return;
        setUserData(profile);
        setProfileImageUrl(profile.dp || profile.displayPictureUrl || null);
      } catch {
        // Non-critical — fallback avatar still shows
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const img1 = previewItems[0]?.image;
  const img2 = previewItems[1]?.image;

  return (
    <>
      <header className="row header-container header-row">
        <div className="header-nav-group">
          {showBackButton ? (
            <button
              type="button"
              className="btn-ghost glass-button header-icon-btn"
              onClick={() => navigateTo(backTo)}
              aria-label="Back"
            >
              <IoIosArrowBack size={24} />
            </button>
          ) : (
            onOpenSidebar && (
              <button
                type="button"
                className="lg:hidden btn-ghost glass-button header-icon-btn"
                onClick={onOpenSidebar}
                aria-label="Open conversations"
              >
                <FaEllipsisV size={18} />
              </button>
            )
          )}
          <button
            type="button"
            className="glass-button header-pill-btn"
            onClick={() => navigateTo("/ai-friend")}
            aria-label="AI Friend"
          >
            AI Friend
          </button>
          <button
            type="button"
            className="glass-button header-pill-btn"
            onClick={() => navigateTo("/ai-psychology")}
            aria-label="AI Psychology"
          >
            AI Psychology
          </button>
        </div>

        <div className="header-actions-right">
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
            className={`header-profile-btn btn-ghost glass-button ${isActive("/profile") ? "active" : ""}`}
            onClick={() => navigateTo("/profile")}
            aria-label="Profile"
          >
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt="Your profile"
                className="header-profile-avatar"
                draggable={false}
                onError={() => setProfileImageUrl(null)}
              />
            ) : (
              <img
                src={getUserAvatarFallbackUrl(80)}
                alt="Your profile"
                className="header-profile-avatar"
                draggable={false}
              />
            )}
          </button>
        </div>
      </header>
      <style>
        {`
          .header-row {
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 4px !important;
            width: 100%;
            min-height: auto !important;
            padding-block: 8px !important;
            overflow: hidden;
          }

          .header-nav-group {
            display: flex;
            align-items: center;
            min-width: 0;
            flex: 1 1 auto;
            gap: clamp(2px, 1vw, 8px);
            overflow: hidden;
          }

          .header-icon-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            min-width: 36px;
            min-height: 36px;
            padding: 0;
            flex-shrink: 0;
            touch-action: manipulation;
          }

          .header-pill-btn {
            font-weight: 700;
            font-family: Ubuntu, sans-serif;
            border-radius: 8px;
            height: 32px;
            padding: 0 8px;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            white-space: nowrap;
            flex-shrink: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            touch-action: manipulation;
          }

          .header-actions-right {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            flex-shrink: 0;
            gap: 6px;
            margin-left: 4px;
            position: relative;
            z-index: 5;
          }

          .discover-header-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 2.5rem;
            min-height: 2.25rem;
            padding: 2px 4px;
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
            width: 2.75rem;
            height: 2rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            flex-shrink: 0;
          }

          .discover-preview-img {
            position: absolute;
            width: 1.5rem;
            height: 1.85rem;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid var(--border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            transition: transform 0.2s ease;
            pointer-events: none;
            user-select: none;
          }

          .discover-preview-img--back {
            transform: rotate(-7deg) translateX(-7px);
            z-index: 1;
            opacity: 0.92;
          }

          .discover-preview-img--front {
            transform: rotate(8deg) translateX(7px);
            z-index: 2;
          }

          .discover-header-btn:active .discover-preview-img--back {
            transform: rotate(-7deg) translateX(-7px) scale(0.96);
          }

          .discover-header-btn:active .discover-preview-img--front {
            transform: rotate(8deg) translateX(7px) scale(0.96);
          }

          .discover-preview-fallback {
            pointer-events: none;
            white-space: nowrap;
          }

          .header-profile-btn {
            width: 36px;
            height: 36px;
            min-width: 36px;
            min-height: 36px;
            padding: 0 !important;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
            overflow: hidden;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
          }

          .header-profile-avatar {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: inherit;
            display: block;
          }

          @media (min-width: 390px) {
            .header-icon-btn {
              width: 40px;
              height: 40px;
              min-width: 40px;
              min-height: 40px;
            }

            .header-pill-btn {
              height: 36px;
              padding: 0 10px;
              font-size: 13px;
            }

            .header-profile-btn {
              width: 40px;
              height: 40px;
              min-width: 40px;
              min-height: 40px;
            }

            .discover-preview-stack {
              width: 3.25rem;
              height: 2.25rem;
            }

            .discover-preview-img {
              width: 1.75rem;
              height: 2.1rem;
            }
          }

          @media (min-width: 768px) {
            .header-pill-btn {
              height: 40px;
              padding: 0 12px;
              font-size: 14px;
            }

            .header-profile-btn {
              width: 48px;
              height: 48px;
              min-width: 48px;
              min-height: 48px;
            }
          }
        `}
      </style>
    </>
  );
};
