import React from "react";
import { FaUserCircle } from "react-icons/fa";
import { Dot } from "./Dot";
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
          }}
        >
          <button
            className={`btn-ghost ${isActive("/profile") ? "active" : ""}`}
            onClick={() => navigateTo("/profile")}
            aria-label="Profile"
            style={{
              padding: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 36,
              minHeight: 36,
            }}
          >
            <FaUserCircle size={20} />
          </button>
          <div
            className="h1 header-title"
            style={{ cursor: "pointer", fontSize: "clamp(20px, 4vw, 28px)" }}
            onClick={() => navigateTo("/")}
          >
            Perlé <Dot />
          </div>
        </div>

        <div className="row header-right" style={{ gap: 4, flexShrink: 0 }}>
          <button
            className={`btn-ghost ${isActive("/ai-friend") ? "active" : ""}`}
            onClick={() => navigateTo("/ai-friend")}
            aria-label="AI Friend"
            style={{
              padding: "6px 10px",
              fontSize: "clamp(12px, 2.5vw, 14px)",
              minHeight: 36,
            }}
          >
            AI Friend
          </button>
          <button
            className={`btn-ghost ${isActive("/discover") ? "active" : ""}`}
            onClick={() => navigateTo("/discover")}
            aria-label="Discover"
            style={{
              padding: "6px 10px",
              fontSize: "clamp(12px, 2.5vw, 14px)",
              minHeight: 36,
            }}
          >
            Discover
          </button>
          <button
            className={`btn-ghost ${isActive("/library") ? "active" : ""}`}
            onClick={() => navigateTo("/library")}
            aria-label="Library"
            style={{
              padding: "6px 10px",
              fontSize: "clamp(12px, 2.5vw, 14px)",
              minHeight: 36,
            }}
          >
            Library
          </button>
        </div>
      </header>
      <style>
        {`
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
              font-size: clamp(20px, 5vw, 26px) !important;
              line-height: 1.2 !important;
            }
            
            .header-right {
              gap: 6px !important;
            }
            
            .header-right .btn-ghost {
              padding: 8px 12px !important;
              font-size: clamp(13px, 3vw, 14px) !important;
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
              font-size: clamp(18px, 4.5vw, 22px) !important;
            }
            
            .header-right {
              gap: 4px !important;
            }
            
            .header-right .btn-ghost {
              padding: 7px 10px !important;
              font-size: clamp(12px, 2.8vw, 13px) !important;
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
