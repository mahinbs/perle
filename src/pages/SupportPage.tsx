import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { 
  IoIosArrowBack, 
  IoIosSearch, 
  IoMdPerson, 
  IoMdCard, 
  IoMdInformationCircle, 
  IoMdLock,
  IoMdChatbubbles,
  IoMdHelpCircle
} from "react-icons/io";

export default function SupportPage() {
  const { navigateTo } = useRouterNavigation();
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    {
      title: "Account & Profile",
      icon: <IoMdPerson size={24} color="var(--accent)" />,
      description: "Manage your account settings, password, and profile information.",
      link: "/profile"
    },
    {
      title: "Billing & Plans",
      icon: <IoMdCard size={24} color="var(--accent)" />,
      description: "Questions about subscriptions, payments, and premium features.",
      link: "/upgrade"
    },
    {
      title: "AI & Research",
      icon: <IoMdInformationCircle size={24} color="var(--accent)" />,
      description: "Learn how to get the most out of our AI research models.",
      link: "/help"
    },
    {
      title: "Privacy & Security",
      icon: <IoMdLock size={24} color="var(--accent)" />,
      description: "Information about data protection and search privacy.",
      link: "/privacy"
    }
  ];

  const quickLinks = [
    { title: "Contact Us", icon: <IoMdChatbubbles />, link: "/contact" },
    { title: "FAQs", icon: <IoMdHelpCircle />, link: "/help" },
  ];

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
        <div className="h1">Support Center</div>
        <button
          className="btn-ghost glass-button"
          onClick={() => navigateTo("/profile")}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
      </div>

      {/* Search Section */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24, textAlign: "center" }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>How can we help?</h2>
        <p className="sub" style={{ marginBottom: 20 }}>Search our help center for quick answers and guides.</p>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>
            <IoIosSearch size={20} />
          </div>
          <input
            type="text"
            placeholder="Search for help topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input"
            style={{ width: "100%", padding: "14px 16px 14px 48px", fontSize: "var(--font-md)" }}
          />
        </div>
      </div>

      {/* Categories Grid */}
      <div className="row" style={{ gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        {categories.map((cat, index) => (
          <div 
            key={index}
            className="glass-card"
            onClick={() => navigateTo(cat.link)}
            style={{ 
              flex: "1 1 calc(50% - 16px)", 
              minWidth: 280, 
              padding: 24, 
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            <div className="glass-button" style={{ width: 48, height: 48, borderRadius: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {cat.icon}
            </div>
            <h3 className="h3">{cat.title}</h3>
            <p className="sub" style={{ fontSize: "var(--font-sm)" }}>{cat.description}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="glass-card" style={{ padding: 20 }}>
        <h3 className="h3" style={{ marginBottom: 16 }}>Direct Support</h3>
        <div className="row" style={{ gap: 12 }}>
          {quickLinks.map((link, index) => (
            <button
              key={index}
              className="btn-ghost glass-button"
              onClick={() => navigateTo(link.link)}
              style={{ flex: 1, gap: 10, justifyContent: "center" }}
            >
              {link.icon}
              {link.title}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <p className="sub" style={{ marginBottom: 12 }}>Available 24/7 for urgent inquiries.</p>
          <a 
            href="mailto:support@syntraiq.com" 
            className="btn-primary" 
            style={{ 
              display: "inline-flex", 
              alignItems: "center", 
              gap: 8, 
              padding: "12px 32px",
              textDecoration: "none",
              color: "#111"
            }}
          >
            Send an Email
          </a>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 40, opacity: 0.6, fontSize: "var(--font-sm)" }}>
        © {new Date().getFullYear()} SyntraIQ Support. All rights reserved.
      </div>
    </div>
  );
}
