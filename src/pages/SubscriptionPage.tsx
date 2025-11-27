import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IoClose, IoSparklesOutline } from "react-icons/io5";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const plans = [
  {
    id: "pro",
    name: "Upgrade to IQ Pro",
    shortName: "IQ Pro",
    price: "₹399.00/mo",
    description:
      "Perfect for creators and strategists who need faster answers, longer conversations, and richer exports.",
    perks: [
      "Priority access to SyntraIQ models",
      "Unlimited saved Spaces and prompts",
      "Advanced file analysis up to 200 MB",
    ],
    cta: "Get IQ Pro",
  },
  {
    id: "max",
    name: "Upgrade to IQ Max",
    shortName: "IQ Max",
    price: "₹899.00/mo",
    description:
      "Built for teams running mission-critical workflows with the highest limits and premium support.",
    perks: [
      "Highest message and upload limits",
      "Real-time collaboration in shared Spaces",
      "White-glove onboarding & priority support",
    ],
    cta: "Get IQ Max",
    highlighted: true,
  },
];

export default function SubscriptionPage() {
  const { goBack } = useRouterNavigation();
  const [searchParams] = useSearchParams();
  const initialPlanId = searchParams.get("plan") || plans[0].id;
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  return (
    <div className="fixed inset-0 bg-[var(--bg)] text-[var(--text)] z-50 flex flex-col p-4 pt-[calc(16px+var(--safe-area-top))] pb-[calc(16px+var(--safe-area-bottom))]">
      {/* Top Bar */}
      <div className="flex justify-start mb-6">
        <button
          onClick={() => goBack()}
          className="bg-transparent border-none text-[var(--text)] cursor-pointer p-0"
        >
          <IoClose size={28} />
        </button>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="h1 justify-center mb-4 text-[40px] tracking-[-1px]">
          Syntra<span className="text-gold">IQ</span>
        </h1>
        <div className="sub text-[var(--font-lg)] max-w-[85%] mx-auto text-[var(--text)] font-medium leading-[1.4]">
          Introducing SyntraIQ
          <br />
          The most powerful AI model.
        </div>
      </div>

      {/* Features - Scrollable Fixed Height */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 pb-[260px]">
          {selectedPlan.perks
            .concat(selectedPlan.perks, selectedPlan.perks)
            .map((perk, index) => (
              <div
                key={index}
                className="flex items-start gap-4 text-[var(--font-lg)]"
              >
                <IoSparklesOutline
                  size={24}
                  className="min-w-[24px] mt-[2px] text-[var(--text)]"
                />
                <span>{perk}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Bottom Actions Sheet */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-6 pb-[calc(16px+var(--safe-area-bottom))] bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent z-10 flex flex-col gap-4 pointer-events-none">
        {/* Plan Selector */}
        <div className="grid grid-cols-2 gap-3 overflow-x-auto pb-1 scrollbar-none pointer-events-auto">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`flex-none w-full border rounded-[18px] p-4 cursor-pointer flex flex-col justify-between h-[130px] transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)] ${
                  isSelected
                    ? "border-2 border-[var(--text)] bg-[var(--card)]"
                    : "border border-[var(--border)] backdrop-blur-[2px]"
                }`}
              >
                <div className="font-bold text-[var(--font-lg)] leading-[1.2]">
                  {plan.shortName}
                </div>
                <div className="text-[var(--font-md)] opacity-80 font-medium">
                  {plan.price}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <button className="btn w-full rounded-full bg-[var(--text)] text-[var(--bg)] h-14 text-[var(--font-lg)] shadow-[0_4px_12px_rgba(0,0,0,0.1)] pointer-events-auto">
          {selectedPlan.cta}
        </button>
      </div>
    </div>
  );
}
