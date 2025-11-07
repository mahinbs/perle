import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const features = [
  {
    icon: "📁",
    title: "Upload Sources",
    description:
      "Bring in documents, links, and notes so Perlé can answer deep project questions.",
  },
  {
    icon: "✨",
    title: "Set AI Instructions",
    description:
      "Tailor the assistant with prompts that convert research into FAQs, briefs, or summaries.",
  },
  {
    icon: "🔗",
    title: "Share Your Space",
    description:
      "Invite teammates, keep threads together, and build a reusable knowledge base for the group.",
  },
];

export default function SpacesPage() {
  const { navigateTo } = useRouterNavigation();

  return (
    <div
      className="container"
      style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: "100vh" }}
    >
      {/* Header */}
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/profile")}
          aria-label="Back to profile"
          style={{ fontSize: "var(--font-md)" }}
        >
          ← Back
        </button>
        <div className="h1" style={{ margin: 0 }}>
          Spaces
        </div>
        <div style={{ width: 52 }} />
      </div>

      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div className="h2" style={{ marginBottom: 8 }}>
            Create a Space
          </div>
          <div className="sub" style={{ lineHeight: 1.6 }}>
            Organize threads and files for projects, teams, or topics. Spaces act as dedicated
            workspaces where you can orchestrate custom AI research workflows from start to finish.
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

        <button
          className="btn"
          onClick={() => navigateTo("/ai-friend")}
          style={{ alignSelf: "stretch" }}
        >
          Create a space
        </button>
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
          Why use Spaces?
        </div>
        <div className="sub" style={{ lineHeight: 1.6 }}>
          Spaces keep research aligned. Group live conversations, curated sources, and reusable
          prompts so every teammate can pick up where the last one left off.
        </div>
        <div className="sub text-sm" style={{ opacity: 0.7 }}>
          Tip: create one Space for each client or initiative to streamline approvals and share
          updates faster.
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

