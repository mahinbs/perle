import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosArrowBack } from "react-icons/io";
import logo from "../assets/images/logo-1.png";

export default function AboutPage() {
  const { navigateTo } = useRouterNavigation();

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
        <div className="h1">About</div>
        <button
          className="btn-ghost glass-button"
          onClick={() => navigateTo("/profile")}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
      </div>

      <div className="glass-card" style={{ padding: 32, textAlign: "center", marginBottom: 20 }}>
        <img 
          src={logo} 
          alt="SyntraIQ Logo" 
          style={{ width: 80, height: 80, objectFit: "contain", marginBottom: 16, filter: "invert(1)" }} 
        />
        <h2 className="h2" style={{ marginBottom: 8 }}>SyntraIQ</h2>
        <p className="sub" style={{ marginBottom: 24 }}>Version 1.0.0</p>
        
        <p style={{ lineHeight: 1.6, marginBottom: 16 }}>
          SyntraIQ is your intelligent companion for knowledge discovery and creative exploration. 
          Powered by advanced AI models, we help you find answers, generate content, and explore new ideas.
        </p>
        
        <p style={{ lineHeight: 1.6 }}>
          Our mission is to make information accessible, understandable, and useful for everyone.
        </p>
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        <h3 className="h3" style={{ marginBottom: 16 }}>Connect With Us</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <a href="https://twitter.com/syntraiq" target="_blank" rel="noopener noreferrer" className="btn-ghost glass-button" style={{ justifyContent: "flex-start" }}>
            Follow on Twitter
          </a>
          <a href="https://instagram.com/syntraiq" target="_blank" rel="noopener noreferrer" className="btn-ghost glass-button" style={{ justifyContent: "flex-start" }}>
            Follow on Instagram
          </a>
          <a href="mailto:contact@syntraiq.com" className="btn-ghost glass-button" style={{ justifyContent: "flex-start" }}>
            Contact Support
          </a>
        </div>
      </div>
      
      <div style={{ textAlign: "center", marginTop: 32, opacity: 0.6, fontSize: "var(--font-sm)" }}>
        © {new Date().getFullYear()} SyntraIQ. All rights reserved.
      </div>
    </div>
  );
}
