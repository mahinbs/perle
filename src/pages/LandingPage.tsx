import { useEffect, useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosSearch, IoMdCheckmark, IoMdRocket, IoMdChatbubbles, IoMdFlame } from "react-icons/io";
import logo from "../assets/images/logo.png";
import { getUserData } from "../utils/auth";

export default function LandingPage() {
  const { navigateTo } = useRouterNavigation();
  const [bgVideo, setBgVideo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("../assets/syntra-bg-video.mp4")
      .then((mod) => {
        if (!cancelled) setBgVideo(mod.default);
      })
      .catch(() => {
        if (!cancelled) setBgVideo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlanClick = (planId: string) => {
    const user = getUserData();
    if (user) {
      navigateTo(`/subscription?plan=${planId}`);
    } else {
      navigateTo("/profile", { mode: "signup", plan: planId });
    }
  };

  const plans = [
    {
      id: "pro",
      name: "IQ Pro",
      price: "₹399/mo",
      description: "Perfect for creators and strategists who need faster answers, richer data, and deeper research.",
      perks: [
        "Priority access to SyntraIQ models",
        "Unlimited saved Spaces and prompts",
        "Advanced file analysis up to 200 MB",
        "Faster inference speeds",
        "Standard support"
      ],
      cta: "Get IQ Pro",
      highlighted: false,
    },
    {
      id: "max",
      name: "IQ Max",
      price: "₹899/mo",
      description: "Built for teams running mission-critical workflows with the highest limits and premium support.",
      perks: [
        "Highest message and upload limits",
        "Real-time collaboration in shared Spaces",
        "Advanced analytics & usage insights",
        "API access for automated workflows",
        "White-glove onboarding & priority support"
      ],
      cta: "Get IQ Max",
      highlighted: true,
    }
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Background Video - full opacity, dark overlay for readability */}
      <div className="fixed inset-0 pointer-events-none z-0 select-none">
        {bgVideo ? (
        <video
          src={bgVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover opacity-30"
        />
        ) : null}
        {/* Dark overlay so content stays legible */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.75) 100%)" }} />
      </div>
      
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 border-b" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(10,10,10,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo("/home")}>
            {/* filter:invert turns the black icon white, removing the white bg appearance on dark pages */}
            <img src={logo} alt="SyntraIQ Logo" className="w-14 h-14 object-contain" style={{ filter: "invert(1)", background: "none" }} />
            <span className="text-xl font-bold tracking-wider font-ubuntu">
              Syntra<span style={{ color: "var(--accent)" }}>IQ</span>
            </span>
          </div>
          <button 
            className="btn font-bold px-6 py-2 rounded-lg cursor-pointer"
            style={{ background: "var(--accent)", color: "#111", fontSize: "var(--font-sm)" }}
            onClick={() => navigateTo("/")}
          >
            Launch App
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 z-10 max-w-6xl mx-auto px-6 py-12 w-full">
        
        {/* Hero Section */}
        <section className="text-center py-16 md:py-24 flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold tracking-wide" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(199, 168, 105, 0.08)" }}>
            <IoMdFlame size={14} /> Introducing SyntraIQ 1.0.1
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl leading-tight font-ubuntu">
            Intelligent Knowledge Discovery <br />
            <span style={{ color: "var(--accent)" }}>Redefined</span>
          </h1>
          <p className="text-lg md:text-xl max-w-2xl text-center" style={{ color: "var(--sub)" }}>
            SyntraIQ is your elite companion for deep research, quick insights, and creative exploration. Access state-of-the-art models, upload files for complex analysis, and collaborate in custom workspaces.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full justify-center">
            <button 
              className="btn font-bold px-8 py-3.5 rounded-xl cursor-pointer"
              style={{ background: "var(--accent)", color: "#111", minWidth: "180px" }}
              onClick={() => navigateTo("/")}
            >
              Start Searching
            </button>
            <a 
              href="#pricing"
              className="btn-ghost font-bold px-8 py-3.5 rounded-xl flex items-center justify-center cursor-pointer"
              style={{ minWidth: "180px", color: "var(--text)", borderColor: "var(--border)" }}
            >
              View Pricing
            </a>
          </div>
        </section>

        {/* Feature Cards Section */}
        <section className="py-16 border-t border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-bold font-ubuntu mb-4">Core Capabilities</h2>
            <p className="max-w-xl mx-auto" style={{ color: "var(--sub)" }}>Discover what makes SyntraIQ the ultimate research and conversational tool.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card p-8 flex flex-col gap-4 text-left" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(199, 168, 105, 0.12)" }}>
                <IoIosSearch size={24} color="var(--accent)" />
              </div>
              <h3 className="text-xl font-bold font-ubuntu">AI Search Engine</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--sub)" }}>
                Run queries using specialized modes: Ask for quick answers, Research for comprehensive sources, Summarize for long texts, or Compare to see distinct viewpoints.
              </p>
            </div>
            <div className="card p-8 flex flex-col gap-4 text-left" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(199, 168, 105, 0.12)" }}>
                <IoMdChatbubbles size={24} color="var(--accent)" />
              </div>
              <h3 className="text-xl font-bold font-ubuntu">Companions & Friends</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--sub)" }}>
                Interact with custom personalities like AI Friend or AI Psychology. Get therapeutic validation or casual conversations backed by contextual memory.
              </p>
            </div>
            <div className="card p-8 flex flex-col gap-4 text-left" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(199, 168, 105, 0.12)" }}>
                <IoMdRocket size={24} color="var(--accent)" />
              </div>
              <h3 className="text-xl font-bold font-ubuntu">Spaces & Library</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--sub)" }}>
                Organize your research topics into Spaces. Upload files (PDFs, images) to analyze contents in-depth, and bookmark answers to your Library.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Plans Section */}
        <section id="pricing" className="py-16 md:py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold font-ubuntu mb-4">Choose Your Speed</h2>
            <p className="max-w-xl mx-auto" style={{ color: "var(--sub)" }}>Flexible monthly pricing options to fuel your learning pace. Upgrade, downgrade, or cancel anytime.</p>
            {/* Apple 2.3.2 — paid content disclosure */}
            <p
              className="max-w-xl mx-auto mt-3 text-xs"
              style={{
                color: "var(--sub)",
                background: "rgba(199,168,105,0.07)",
                border: "1px solid rgba(199,168,105,0.2)",
                borderRadius: "8px",
                padding: "10px 16px",
                display: "inline-block",
              }}
            >
              💳 <strong>IQ Pro</strong> and <strong>IQ Max</strong> are paid subscriptions and require an <strong>In-App Purchase</strong>. Prices shown in USD/month. Billed monthly. Cancel anytime. Subscription auto-renews unless cancelled at least 24 hours before the renewal date.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan) => (
              <div 
                key={plan.id}
                className="card p-8 flex flex-col justify-between gap-8 relative"
                style={{
                  background: "var(--card)",
                  borderWidth: plan.highlighted ? "2px" : "1px",
                  borderColor: plan.highlighted ? "var(--accent)" : "var(--border)",
                  boxShadow: plan.highlighted ? "0 16px 32px rgba(0, 0, 0, 0.15)" : "var(--shadow)"
                }}
              >
                {plan.highlighted && (
                  <span 
                    className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold border tracking-wider"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(199, 168, 105, 0.1)" }}
                  >
                    MOST POPULAR
                  </span>
                )}
                <div>
                  <h3 className="text-2xl font-bold font-ubuntu mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                    <span className="text-sm" style={{ color: "var(--sub)" }}>/month</span>
                  </div>
                  {/* In-App Purchase label — Apple 2.3.2 */}
                  <p className="text-xs mb-4" style={{ color: "var(--sub)", opacity: 0.7 }}>
                    In-App Purchase · Auto-renews monthly
                  </p>
                  <p className="text-sm mb-6" style={{ color: "var(--sub)", lineHeight: "1.5" }}>{plan.description}</p>
                  
                  <ul className="flex flex-col gap-3">
                    {plan.perks.map((perk, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm" style={{ color: "var(--text)" }}>
                        <span className="mt-0.5" style={{ color: "var(--accent)" }}><IoMdCheckmark size={16} /></span>
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2">
                  <button 
                    className="btn w-full font-bold py-3 rounded-xl cursor-pointer"
                    style={{
                      background: plan.highlighted ? "var(--accent)" : "#1a1a1a",
                      color: plan.highlighted ? "#111" : "#fff",
                      border: plan.highlighted ? "none" : "1px solid var(--border)"
                    }}
                    onClick={() => handlePlanClick(plan.id)}
                  >
                    {plan.cta}
                  </button>
                  <p className="text-center text-xs" style={{ color: "var(--sub)", opacity: 0.6 }}>
                    Requires In-App Purchase
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>


      </main>

      {/* Landing-Page-Only Footer */}
      <footer className="w-full py-12 border-t z-10" style={{ borderColor: "var(--border)", background: "rgba(10, 10, 10, 0.8)" }}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="SyntraIQ Logo" className="w-11 h-11 object-contain" style={{ filter: "invert(1)", background: "none" }} />
            <span className="text-lg font-bold tracking-wider font-ubuntu">
              Syntra<span style={{ color: "var(--accent)" }}>IQ</span>
            </span>
          </div>
          
          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
            <a 
              href="/privacy-policy" 
              onClick={(e) => { e.preventDefault(); navigateTo("/privacy-policy"); }}
              className="transition-colors hover:text-white"
              style={{ color: "var(--sub)" }}
            >
              Privacy Policy
            </a>
            <a 
              href="/terms-conditions" 
              onClick={(e) => { e.preventDefault(); navigateTo("/terms-conditions"); }}
              className="transition-colors hover:text-white"
              style={{ color: "var(--sub)" }}
            >
              Terms & Conditions
            </a>
            <a 
              href="/refund-cancellation" 
              onClick={(e) => { e.preventDefault(); navigateTo("/refund-cancellation"); }}
              className="transition-colors hover:text-white"
              style={{ color: "var(--sub)" }}
            >
              Refund/Cancellation
            </a>
            <a 
              href="/contact-us" 
              onClick={(e) => { e.preventDefault(); navigateTo("/contact-us"); }}
              className="transition-colors hover:text-white"
              style={{ color: "var(--sub)" }}
            >
              Contact Us
            </a>
            <a 
              href="/support" 
              onClick={(e) => { e.preventDefault(); navigateTo("/support"); }}
              className="transition-colors hover:text-white"
              style={{ color: "var(--sub)" }}
            >
              Support
            </a>
          </nav>

          <div className="text-xs" style={{ color: "var(--sub)" }}>
            © {new Date().getFullYear()} SyntraIQ. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
