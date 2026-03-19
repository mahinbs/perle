import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IoClose } from "react-icons/io5";
import { FaCheck, FaTimes } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const plans = [
  // {
  //   id: "free",
  //   name: "Free",
  //   shortName: "Free",
  //   price: "₹0/mo",
  //   description: "Get started with SyntraIQ at no cost.",
  //   perks: [
  //     { text: "Gemini Lite model only", included: true },
  //     { text: "5 messages of conversation memory", included: true },
  //     { text: "3 image generations/day", included: true },
  //     { text: "Video generation", included: false },
  //     { text: "Spaces & prompts", included: true },
  //     { text: "10 MB file uploads (images, PDFs, docs)", included: true },
  //     { text: "Search conversation history (10 messages)", included: true },
  //     { text: "All AI models (GPT-4o, Claude, Grok, etc.)", included: false },
  //   ],
  //   cta: "Current Plan",
  //   disabled: true,
  // },
  {
    id: "pro",
    name: "Upgrade to IQ Pro",
    shortName: "IQ Pro",
    price: "₹399/mo",
    description:
      "For creators and power users who need faster answers, more memory, and richer content creation.",
    perks: [
      { text: "All AI models — GPT-4o, Claude, Gemini, Grok & more", included: true },
      { text: "20 messages of deep conversation memory", included: true },
      { text: "Unlimited image generation", included: true },
      { text: "Video generation — up to 6 videos/day", included: true },
      { text: "Unlimited saved Spaces & prompts", included: true },
      { text: "10 MB file uploads (images, PDFs, docs)", included: true },
      { text: "50 messages retained per search conversation", included: true },
      { text: "Toggle auto-renewal anytime", included: true },
    ],
    cta: "Get IQ Pro",
    highlighted: false,
  },
  {
    id: "max",
    name: "Upgrade to IQ Max",
    shortName: "IQ Max",
    price: "₹899/mo",
    description:
      "Built for teams and power users who demand the absolute highest limits and premium support.",
    perks: [
      { text: "Everything in IQ Pro", included: true },
      { text: "All AI models — including latest releases", included: true },
      { text: "Unlimited image generation", included: true },
      { text: "Video generation — up to 12 videos/day (2× Pro)", included: true },
      { text: "Unlimited saved Spaces & prompts", included: true },
      { text: "10 MB file uploads (images, PDFs, docs)", included: true },
      { text: "50 messages retained per search conversation", included: true },
      { text: "Priority access & support", included: true },
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

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[1];

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
      <div className="text-center mb-6">
        <h1 className="h1 justify-center mb-3 text-[40px] tracking-[-1px]">
          Syntra<span className="text-gold">IQ</span>
        </h1>
        <p className="sub text-[var(--font-md)] font-medium leading-[1.4]">
          {selectedPlan.description}
        </p>
      </div>

      {/* Features List — Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-2 pb-[280px]">
          {selectedPlan.perks.map((perk, index) => (
            <div key={index} className="flex items-start gap-4 text-[var(--font-md)]">
              {perk.included ? (
                <FaCheck
                  size={16}
                  className="min-w-[16px] mt-[3px]"
                  style={{ color: "var(--accent)", flexShrink: 0 }}
                />
              ) : (
                <FaTimes
                  size={16}
                  className="min-w-[16px] mt-[3px]"
                  style={{ color: "var(--border)", flexShrink: 0 }}
                />
              )}
              <span
                style={{
                  lineHeight: 1.5,
                  color: perk.included ? "var(--text)" : "var(--sub)",
                }}
              >
                {perk.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Actions Sheet */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-6 pb-[calc(16px+var(--safe-area-bottom))] bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent z-10 flex flex-col gap-4">
        {/* Plan Selector */}
        <div className="grid grid-cols-2 gap-2">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`flex-none w-full border rounded-[18px] p-4 cursor-pointer flex flex-col justify-between h-[130px] transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)] ${isSelected
                  ? "border-2 !border-[var(--text)] bg-[var(--card)] glass-button"
                  : "border border-[var(--border)] backdrop-blur-[1.5px]"
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
        <button
          className="btn w-full rounded-full h-14 text-[var(--font-lg)] shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
          style={{
            background: "var(--text)",
            color: "var(--bg)",
            cursor: "pointer",
          }}
        >
          {selectedPlan.cta}
        </button>

        {/* Restore link */}
        <button
          className="text-center text-[var(--sub)] underline text-[var(--font-sm)] bg-transparent border-none cursor-pointer"
          onClick={() => console.log("Restore subscription clicked")}
        >
          Restore subscription
        </button>
      </div>
    </div>
  );
}
