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
    <header
      className="row"
      style={{ justifyContent: "space-between", alignItems: "center",paddingBlock:"10px" }}
    >
      <div
        className="row"
        style={{
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          className={`btn-ghost ${isActive("/profile") ? "active" : ""}`}
          onClick={() => navigateTo("/profile")}
          aria-label="Profile"
          style={{
            padding: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaUserCircle size={24} />
        </button>
        <div
          className="h1"
          style={{ cursor: "pointer" }}
          onClick={() => navigateTo("/")}
        >
          Perlé <Dot />
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button
          className={`btn-ghost ${isActive("/ai-friend") ? "active" : ""}`}
          onClick={() => navigateTo("/ai-friend")}
          aria-label="AI Friend"
        >
          AI Friend
        </button>
        <button
          className={`btn-ghost ${isActive("/discover") ? "active" : ""}`}
          onClick={() => navigateTo("/discover")}
          aria-label="Discover"
        >
          Discover
        </button>
        <button
          className={`btn-ghost ${isActive("/library") ? "active" : ""}`}
          onClick={() => navigateTo("/library")}
          aria-label="Library"
        >
          Library
        </button>
      </div>
    </header>
  );
};
