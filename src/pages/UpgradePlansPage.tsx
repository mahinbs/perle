import { IoIosArrowBack } from "react-icons/io";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const plans = [
  {
    id: "pro",
    name: "Upgrade to IQ Pro",
    price: "₹399/mo",
    description:
      "Perfect for creators and strategists who need faster answers, longer conversations, and richer exports.",
    perks: [
      "Priority access to SyntraIQ models",
      "Unlimited saved Spaces and prompts",
      "Advanced file analysis up to 200 MB",
    ],
    cta: "Choose IQ Pro",
  },
  {
    id: "max",
    name: "Upgrade to IQ Max",
    price: "₹899/mo",
    description:
      "Built for teams running mission-critical workflows with the highest limits and premium support.",
    perks: [
      "Highest message and upload limits",
      "Real-time collaboration in shared Spaces",
      "White-glove onboarding & priority support",
    ],
    cta: "Choose IQ Max",
    highlighted: true,
  },
];

export default function UpgradePlansPage() {
  const { navigateTo } = useRouterNavigation();

  return (
    <div
      className="container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        paddingBottom: 40,
      }}
    >
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
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
          Choose your plan
        </div>
        <div style={{ width: 52 }} />
      </div>

      <div className="sub" style={{ lineHeight: 1.6 }}>
        Unlock more power with Syntra
        <span style={{ color: "var(--accent)" }}>IQ</span>. Pick the plan that
        matches your pace today—change or cancel anytime.
      </div>

      <div className="col" style={{ gap: 20 }}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="card"
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              borderWidth: plan.highlighted ? 2 : 1,
              borderColor: plan.highlighted ? "var(--accent)" : "var(--border)",
              boxShadow: plan.highlighted
                ? "0 16px 32px rgba(0, 0, 0, 0.18)"
                : "var(--shadow)",
            }}
          >
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div>
                <div className="h2" style={{ marginBottom: 4 }}>
                  {plan.name}
                </div>
                <div className="sub" style={{ opacity: 0.7 }}>
                  {plan.price}
                </div>
              </div>
              {plan.highlighted && (
                <span
                  className="pill"
                  style={{
                    borderColor: "var(--accent)",
                    color: "var(--accent)",
                    fontSize: "var(--font-sm)",
                    fontWeight: 600,
                  }}
                >
                  Most Popular
                </span>
              )}
            </div>

            <div className="sub" style={{ lineHeight: 1.6 }}>
              {plan.description}
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {plan.perks.map((perk) => (
                <li
                  key={perk}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    fontSize: "var(--font-md)",
                    color: "var(--text)",
                  }}
                >
                  <span style={{ color: "var(--accent)" }}>•</span>
                  <span>{perk}</span>
                </li>
              ))}
            </ul>

            <button
              className="btn btn-strong"
              style={{
                width: "100%",
                background: plan.highlighted ? "var(--accent)" : "#111111",
                color: plan.highlighted ? "#111111" : "#FFFFFF",
              }}
              onClick={() => {
                // Navigate to subscription page with plan selection
                navigateTo(`/subscription?plan=${plan.id}`);
              }}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
