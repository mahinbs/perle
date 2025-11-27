import { IoIosArrowBack } from "react-icons/io";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const features = [
  {
    icon: "🧭",
    title: "Organize by Initiative",
    description:
      "Gather every brief, attachment, and insight inside a focused hub so nothing falls through the cracks.",
  },
  {
    icon: "🧠",
    title: "Brief SyntraIQ Once",
    description:
      "Capture tone, priorities, and guardrails. Spaces remember your instructions so each follow-up stays on-message.",
  },
  {
    icon: "🤝",
    title: "Invite Collaborators",
    description:
      "Share curated research and live threads with clients or teammates while controlling who can contribute.",
  },
];

export default function SpacesPage() {
  const { navigateTo } = useRouterNavigation();

  return (
    <div
      className="container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/profile")}
          aria-label="Back to profile"
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
        <div className="h1" style={{ margin: 0 }}>
          Spaces
        </div>
        <div style={{ width: 52 }} />
      </div>

      <div
        className="card"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div className="h2" style={{ marginBottom: 8 }}>
            Launch a Space in seconds
          </div>
          <div className="sub" style={{ lineHeight: 1.6 }}>
            Spaces are living workrooms for your most important projects—product
            launches, pitch decks, or deep-dives. Collect assets, craft prompts,
            and let Syntra <span className="text-gold">IQ</span> keep everyone
            aligned.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {features.map((feature) => (
            <div
              key={feature.title}
              className="row"
              style={{ alignItems: "flex-start", gap: 12 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "rgba(199, 168, 105, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--font-lg)",
                  flexShrink: 0,
                }}
              >
                {feature.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div className="h3" style={{ marginBottom: 4 }}>
                  {feature.title}
                </div>
                <div className="sub" style={{ lineHeight: 1.6 }}>
                  {feature.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            className="btn btn-strong"
            onClick={() => navigateTo("/ai-friend")}
            style={{ alignSelf: "stretch" }}
          >
            Start a Space
          </button>
          <button
            className="btn-ghost"
            onClick={() => navigateTo("/library")}
            style={{ alignSelf: "stretch" }}
          >
            Explore saved work
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="h3" style={{ marginBottom: 4 }}>
          Why teams rely on Spaces
        </div>
        <div className="sub" style={{ lineHeight: 1.6 }}>
          Spaces blend structured knowledge with on-demand answers. Keep
          annotated sources, bookmarked prompts, and decision trails ready for
          the next handoff.
        </div>
        <div className="sub text-sm" style={{ opacity: 0.7 }}>
          Pro tip: spin up a Space for each client or campaign to offer
          stakeholders a transparent, always-on briefing room.
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* <div
        className="row"
        style={{
          gap: 8,
          justifyContent: "center",
          padding: "8px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/ai-friend")}
          style={{ flex: 1, minWidth: 140 }}
        >
          Threads
        </button>
        <button
          className="btn"
          onClick={() => navigateTo("/spaces")}
          style={{ flex: 1, minWidth: 140 }}
        >
          Spaces
        </button>
      </div> */}
    </div>
  );
}
