import { useEffect, useState, type FormEvent } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import {
  IoMdCheckmark,
  IoMdChatbubbles,
  IoMdGlobe,
  IoMdBulb,
  IoMdImages,
  IoMdBook,
  IoMdArrowForward,
} from "react-icons/io";
import { HiOutlineSparkles, HiOutlineDocumentSearch } from "react-icons/hi";
import { FiSearch } from "react-icons/fi";
import logo from "../assets/images/logo-1.png";
import watermark from "../assets/gif/syntraiq.gif";
import { getUserData } from "../utils/auth";
import "./LandingPage.css";

const EXAMPLE_QUERIES = [
  "Best AI tools for research in 2026",
  "Explain quantum computing simply",
  "Compare iPhone vs Samsung cameras",
];

const MODELS = ["Gemini", "GPT-4o", "Claude", "Grok", "DeepSeek", "Perplexity"];

const FEATURES = [
  {
    icon: <FiSearch size={22} />,
    title: "Cited answers",
    description:
      "Every response links to real sources — like Perplexity, but with your choice of top AI models and search depth.",
  },
  {
    icon: <IoMdGlobe size={22} />,
    title: "Normal, Web & Deep",
    description:
      "Quick answers, live web research, or deep multi-step investigation — switch modes to match how you think.",
  },
  {
    icon: <HiOutlineDocumentSearch size={22} />,
    title: "Files & documents",
    description:
      "Upload PDFs, images, and docs. Summarize, compare, and extract insights without leaving the chat.",
  },
  {
    icon: <IoMdChatbubbles size={22} />,
    title: "AI Friend & Psychology",
    description:
      "Warm companion chat and thoughtful psychology support — separate spaces with memory that feels human.",
  },
  {
    icon: <IoMdBook size={22} />,
    title: "Discover & Spaces",
    description:
      "Browse trending topics and organize research into Spaces — your personal knowledge workspace.",
  },
  {
    icon: <IoMdImages size={22} />,
    title: "Create & analyze",
    description:
      "Generate images and video, run document analysis, and save everything to your Library.",
  },
];

const MODES = [
  {
    tag: "Normal",
    title: "Instant clarity",
    text: "Fast, focused answers for everyday questions — optimized for speed and readability.",
  },
  {
    tag: "Web",
    title: "Live from the web",
    text: "Pulls fresh sources and citations so you always see what’s current, not outdated training data.",
  },
  {
    tag: "Deep",
    title: "Research-grade depth",
    text: "Longer, structured reports with tables, sections, and thorough comparisons when you need more.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Ask anything",
    text: "Type a question, attach files, or pick a suggested prompt. Auto mode routes to the best model.",
  },
  {
    num: "02",
    title: "Get cited answers",
    text: "Read structured responses with sources you can verify — built for trust, not black-box guesses.",
  },
  {
    num: "03",
    title: "Save & continue",
    text: "Bookmark to Library, open Spaces, or chat with AI Friend — your research stays organized.",
  },
];

const PLANS = [
  {
    id: "pro",
    name: "IQ Pro",
    price: "₹399/mo",
    description:
      "For creators and strategists who need faster answers, richer data, and deeper research.",
    perks: [
      "Priority access to SyntraIQ models",
      "Unlimited saved Spaces and prompts",
      "Advanced file analysis up to 200 MB",
      "Faster inference speeds",
      "Standard support",
    ],
    cta: "Get IQ Pro",
    highlighted: false,
  },
  {
    id: "max",
    name: "IQ Max",
    price: "₹899/mo",
    description:
      "For teams running mission-critical workflows with the highest limits and premium support.",
    perks: [
      "Highest message and upload limits",
      "Real-time collaboration in shared Spaces",
      "Advanced analytics & usage insights",
      "API access for automated workflows",
      "White-glove onboarding & priority support",
    ],
    cta: "Get IQ Max",
    highlighted: true,
  },
];

export default function LandingPage() {
  const { navigateTo } = useRouterNavigation();
  const [query, setQuery] = useState("");

  // Logged-in users should never see the marketing landing page — send
  // them straight to /app. Runs on mount; if the user signs out and
  // comes back the absence of getUserData() means they see the landing.
  useEffect(() => {
    if (getUserData()) {
      navigateTo("/app");
    }
  }, [navigateTo]);

  const goToApp = (searchQuery?: string) => {
    if (searchQuery?.trim()) {
      navigateTo("/app", { searchQuery: searchQuery.trim() });
    } else {
      navigateTo("/app");
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    goToApp(query);
  };

  const handlePlanClick = (planId: string) => {
    const user = getUserData();
    if (user) {
      navigateTo(`/subscription?plan=${planId}`);
    } else {
      navigateTo("/profile", { mode: "signup", plan: planId });
    }
  };

  return (
    <div className="landing">
      <div className="landing__mesh" aria-hidden />
      <div className="landing__orb landing__orb--1" aria-hidden />

      <header className="landing__nav">
        <div className="landing__nav-inner">
          <button type="button" className="landing__brand" onClick={() => window.scrollTo({ top: 0 })}>
            <img src={logo} alt="" />
            <span>
              Syntra<span style={{ color: "var(--landing-gold)" }}>IQ</span>
            </span>
          </button>

          <nav className="landing__nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#modes">Modes</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>

          <div className="landing__nav-actions">
            <button type="button" className="landing__btn-ghost" onClick={() => navigateTo("/profile")}>
              Sign in
            </button>
            <button type="button" className="landing__btn-primary" onClick={() => goToApp()}>
              Open app
            </button>
            <img
              src={logo}
              alt="SyntraIQ"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                objectFit: "contain",
                marginLeft: 4,
              }}
            />
          </div>
        </div>
      </header>

      <main className="landing__main">
        <section className="landing__hero">
          <img src={watermark} alt="" className="landing__watermark" aria-hidden />

          <div className="landing__pill">
            <HiOutlineSparkles size={14} />
            Multi-model AI search &amp; research
          </div>

          <h1>
            Ask anything. <em>Get answers you can trust.</em>
          </h1>

          <p>
            SyntraIQ combines the best of Perplexity-style cited search, OpenAI-grade reasoning, and
            Gemini-level versatility — in one beautiful workspace for web, mobile, and deep research.
          </p>

          <form className="landing__search-demo" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything — we'll cite every answer"
              aria-label="Try a search"
            />
            <button type="submit" className="landing__search-go" aria-label="Search">
              <IoMdArrowForward size={20} />
            </button>
          </form>

          <div className="landing__chips">
            {EXAMPLE_QUERIES.map((q) => (
              <button key={q} type="button" className="landing__chip" onClick={() => goToApp(q)}>
                {q}
              </button>
            ))}
          </div>

          <div className="landing__models" aria-label="Supported models">
            {MODELS.map((m) => (
              <span key={m} className="landing__model">
                {m}
              </span>
            ))}
          </div>

          <div className="landing__hero-actions">
            <button type="button" className="landing__btn-gold" onClick={() => goToApp()}>
              Start for free
            </button>
            <button type="button" className="landing__btn-ghost" onClick={() => navigateTo("/discover")}>
              Explore Discover
            </button>
          </div>
        </section>

        <section id="features" className="landing__section">
          <div className="landing__section-head">
            <h2>One platform. Every way you learn.</h2>
            <p>
              Search, chat, create, and organize — designed for students, founders, and curious minds who
              want more than a generic chatbot.
            </p>
          </div>
          <div className="landing__grid-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="landing__card">
                <div className="landing__card-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="modes" className="landing__section">
          <div className="landing__section-head">
            <h2>Three search modes. One bar.</h2>
            <p>From a quick fact-check to a full research brief — you control the depth.</p>
          </div>
          <div className="landing__modes">
            {MODES.map((m) => (
              <article key={m.tag} className="landing__mode">
                <span className="landing__mode-tag">{m.tag}</span>
                <h3>{m.title}</h3>
                <p style={{ margin: 0, color: "var(--landing-muted)", lineHeight: 1.55, fontSize: "0.92rem" }}>
                  {m.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="landing__section">
          <div className="landing__section-head">
            <h2>How SyntraIQ works</h2>
            <p>Simple flow. Serious results. No prompt-engineering degree required.</p>
          </div>
          <div className="landing__steps">
            {STEPS.map((s) => (
              <article key={s.num} className="landing__step">
                <div className="landing__step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing__cta-band">
          <IoMdBulb size={32} style={{ marginBottom: 16, opacity: 0.9 }} />
          <h2>Ready to think faster?</h2>
          <p>Join SyntraIQ and turn questions into clear, cited knowledge — on web and mobile.</p>
          <button type="button" className="landing__btn-gold" onClick={() => goToApp()}>
            Launch SyntraIQ
          </button>
        </section>

        <section id="pricing" className="landing__section">
          <div className="landing__section-head">
            <h2>Upgrade when you need more</h2>
            <p>Start free. Move to IQ Pro or IQ Max for priority models, higher limits, and team features.</p>
            <p
              style={{
                marginTop: 16,
                fontSize: "0.78rem",
                maxWidth: 520,
                padding: "10px 16px",
                borderRadius: 10,
                background: "var(--landing-gold-soft)",
                border: "1px solid rgba(199,168,105,0.25)",
                color: "var(--landing-muted)",
              }}
            >
              IQ Pro and IQ Max are paid subscriptions (In-App Purchase on mobile). Billed monthly. Cancel
              anytime. Auto-renews unless cancelled 24h before renewal.
            </p>
          </div>
          <div className="landing__pricing-grid">
            {PLANS.map((plan) => (
              <article
                key={plan.id}
                className={`landing__price-card${plan.highlighted ? " landing__price-card--highlight" : ""}`}
              >
                {plan.highlighted && <span className="landing__price-badge">Most popular</span>}
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>{plan.name}</h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: "2rem", fontWeight: 800 }}>{plan.price}</span>
                  </div>
                  <p style={{ margin: "0 0 20px", fontSize: "0.9rem", color: "var(--landing-muted)", lineHeight: 1.5 }}>
                    {plan.description}
                  </p>
                  <ul className="landing__perks">
                    {plan.perks.map((perk) => (
                      <li key={perk}>
                        <IoMdCheckmark size={18} />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className={plan.highlighted ? "landing__btn-gold" : "landing__btn-primary"}
                  style={plan.highlighted ? undefined : { width: "100%", padding: "12px" }}
                  onClick={() => handlePlanClick(plan.id)}
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <div className="landing__footer-inner">
          <div className="landing__brand" style={{ cursor: "default" }}>
            <img src={logo} alt="" />
            <span>
              Syntra<span style={{ color: "var(--landing-gold)" }}>IQ</span>
            </span>
          </div>

          <nav aria-label="Footer">
            <a
              href="/privacy-policy"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/privacy-policy");
              }}
            >
              Privacy
            </a>
            <a
              href="/terms-conditions"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/terms-conditions");
              }}
            >
              Terms
            </a>
            <a
              href="/refund-cancellation"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/refund-cancellation");
              }}
            >
              Refunds
            </a>
            <a
              href="/contact-us"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/contact-us");
              }}
            >
              Contact
            </a>
            <a
              href="/support"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/support");
              }}
            >
              Support
            </a>
          </nav>

          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--landing-muted)" }}>
            © {new Date().getFullYear()} SyntraIQ
          </p>
        </div>
      </footer>
    </div>
  );
}
