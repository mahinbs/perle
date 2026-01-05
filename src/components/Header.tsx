import React from "react";
import { FaUserCircle } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useLocation } from "react-router-dom";

export const Header: React.FC = () => {
  const { navigateTo } = useRouterNavigation();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header
        className="row header-container"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          paddingBlock: "8px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div
          className="row header-left"
          style={{
            gap: 6,
            alignItems: "center",
            flexShrink: 0,
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* <div
            className="row"
            style={{
              gap: 6,
              alignItems: "center",
            }}
          >
            <div
              className="h1 header-title"
              style={{ cursor: "pointer", fontSize: "var(--font-2xl)" }}
              onClick={() => navigateTo("/")}
            >
              Syntra<span className="text-gold -ml-2">IQ</span> <Dot />
            </div>
          </div> */}
          <div className="row header-right" style={{ gap: 5, flexShrink: 0 }}>
            <button
              className={`btn-ghost btn-shadow active !font-bold font-ubuntu`}
              onClick={() => navigateTo("/ai-friend")}
              aria-label="AI Friend"
              style={{
                padding: "6px 10px",
                fontSize: "var(--font-sm)",
                minHeight: 36,
              }}
            >
              AI Friend
            </button>

            <button
              className={`btn-ghost btn-shadow active !font-bold font-ubuntu`}
              onClick={() => navigateTo("/ai-psychology")}
              aria-label="AI Psychology"
              style={{
                padding: "6px 10px",
                fontSize: "var(--font-sm)",
                minHeight: 36,
              }}
            >
              AI Psychology
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`btn-ghost btn-shadow !border-[#dfb768] ${isActive("/discover") ? "active" : ""}`}
              onClick={() => navigateTo("/discover")}
              aria-label="Discover"
              style={{
                padding: 4,
                minHeight: 42,
                minWidth: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="discover-icon" aria-hidden="true">
                <img
                  src="https://res.cloudinary.com/dknafpppp/image/upload/v1759865727/home-based-medical-care-bringing-healthcare-to-your-doorstep_tgkhkw.png"
                  alt=""
                />
                <img
                  src="https://res.cloudinary.com/dknafpppp/image/upload/v1759865401/black_background_qachfc.jpg"
                  alt=""
                />
              </span>
            </button>
            <button
              className={`btn-ghost btn-shadow !border-[#dfb768] ${isActive("/profile") ? "active" : ""}`}
              onClick={() => navigateTo("/profile")}
              aria-label="Profile"
              style={{
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 40,
                minWidth: 48,
              }}
            >
              <FaUserCircle className="min-w-6 min-h-6" size={33} />
            </button>
          </div>
        </div>

        {/* <div className="row header-right" style={{ gap: 5, flexShrink: 0 }}>
          <button
            className={`btn-ghost btn-shadow active`}
            onClick={() => navigateTo("/ai-friend")}
            aria-label="AI Friend"
            style={{
              padding: "6px 10px",
              fontSize: "var(--font-md)",
              minHeight: 36,
            }}
          >
            AI Friend
          </button>

          <button
            className={`btn-ghost btn-shadow active`}
            onClick={() => navigateTo("/")}
            aria-label="Home"
            style={{
              padding: "6px 10px",
              fontSize: "var(--font-md)",
              minHeight: 36,
            }}
          >
            AI Psychology
          </button>
        </div> */}
      </header>
      <style>
        {`
          .discover-icon {
            position: relative;
            width: 1.525rem;
            height: 1.525rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            aspect-ratio: 1/1;
            
          }

          .discover-icon img {
            position: absolute;
            width: 1.45rem;
            height: 1.45rem;
            object-fit: cover;
            border-radius: 12px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            background: var(--card);
          }

          .discover-icon img:first-of-type {
            transform: rotate(-8deg) translateX(-6px);
            z-index: 2;
          }

          .discover-icon img:last-of-type {
            transform: rotate(10deg) translateX(8px);
            z-index: 1;
            filter: brightness(0.92);
          }

          .btn-ghost btn-shadow:hover .discover-icon img {
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
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
            
            .header-title {
              font-size: clamp(1.5rem, 5vw, 1.75rem) !important;
              line-height: 1.2 !important;
            }
            
            .header-right {
              gap: 6px !important;
            }
            
            .header-right .btn-ghost btn-shadow {
              padding: 8px 12px !important;
              font-size: var(--font-md) !important;
              min-height: 40px !important;
            }
            
            .header-left button {
              min-width: 40px !important;
              min-height: 40px !important;
              padding: 8px !important;
            }
            
            .header-left button svg {
              width: 22px !important;
              height: 22px !important;
            }
          }
          
          @media (max-width: 480px) {
            .header-container {
              padding-block: 6px !important;
              gap: 6px !important;
            }
            
            .header-title {
              font-size: clamp(1.35rem, 4.5vw, 1.5rem) !important;
            }
            
            .header-right {
              gap: 4px !important;
            }
            
            .header-right .btn-ghost btn-shadow {
              padding: 7px 10px !important;
              font-size: var(--font-sm) !important;
              min-height: 38px !important;
            }
            
            .header-left button {
              min-width: 38px !important;
              min-height: 38px !important;
              padding: 7px !important;
            }
            
            .header-left button svg {
              width: 20px !important;
              height: 20px !important;
            }
          }
        `}
      </style>
    </>
  );
};
