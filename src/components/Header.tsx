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
          <div className="flex items-center" style={{ gap: "clamp(2px, 1vw, 12px)", flexShrink: 0 }}>
            <button
              className="glass-button !font-bold font-ubuntu dark:border-yellow-300/25 rounded-lg px-2 md:px-3 text-[14px] md:text-[14px] h-[32px] md:h-[40px] flex items-center justify-center cursor-pointer whitespace-nowrap"
              onClick={() => navigateTo("/ai-friend")}
              aria-label="AI Friend"
            >
              AI Friend
            </button>
            {/* border !border-[#dfb768] */}

            <button
              className="glass-button !font-bold font-ubuntu dark:border-yellow-300/25 rounded-lg px-2 md:px-3 text-[14px] md:text-[14px] h-[32px] md:h-[40px] flex items-center justify-center cursor-pointer whitespace-nowrap"
              onClick={() => navigateTo("/ai-psychology")}
              aria-label="AI Psychology"
            >
              AI Psychology
            </button>
          </div>
          <div className="flex items-center" style={{ gap: "clamp(2px, 1vw, 8px)" }}>
            <button
              className={`btn-ghost glass-button p-1 flex items-center justify-center h-[32px] w-[32px] md:h-[40px] md:w-[48px] ${isActive("/discover") ? "active" : ""}`}
              onClick={() => navigateTo("/discover")}
              aria-label="Discover"
            >
              <span className="discover-icon scale-[0.8] md:scale-100" aria-hidden="true">
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
              className={`btn-ghost glass-button p-1 flex items-center justify-center h-[32px] w-[32px] md:h-[40px] md:w-[48px] ${isActive("/profile") ? "active" : ""}`}
              onClick={() => navigateTo("/profile")}
              aria-label="Profile"
            >
              <FaUserCircle className="w-[18px] h-[18px] md:w-[24px] md:h-[24px]" />
            </button>
          </div>
        </div>
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
