import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FaTimes } from "react-icons/fa";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import type { LLMModel, LLMModelInfo, ExperienceMode } from "../types";
import { ProviderLogo } from "./ProviderLogos";

const FREE_TIER_MODEL: LLMModelInfo = {
  id: "gemini-lite",
  name: "Free",
  provider: "Google",
  description: "Free tier model for everyday questions",
  capabilities: ["Free", "Fast", "Efficient"],
};

type SubscriptionTierOption = "pro" | "max";

const SUBSCRIPTION_TIER_OPTIONS: Array<{
  id: SubscriptionTierOption;
  name: string;
  provider: string;
  description: string;
  capabilities: string[];
}> = [
  {
    id: "pro",
    name: "IQ Pro",
    provider: "SyntraIQ",
    description: "All premium AI models, unlimited queries, and richer creation tools",
    capabilities: ["All models", "Unlimited search", "Media creation"],
  },
  {
    id: "max",
    name: "IQ Max",
    provider: "SyntraIQ",
    description: "Everything in IQ Pro with the highest limits and priority support",
    capabilities: ["Priority access", "Max limits", "Team features"],
  },
];

// Premium models available to premium users
const premiumModels: LLMModelInfo[] = [
  {
    id: "exa-auto",
    name: "Exa Auto",
    provider: "Exa",
    description: "Exa semantic search (auto) + AI answer generation",
    capabilities: ["Search Auto", "Balanced", "Fast Setup"],
  },
  {
    id: "exa-instant",
    name: "Exa Instant",
    provider: "Exa",
    description: "Exa low-latency instant web search + AI answer generation",
    capabilities: ["Instant", "Live Crawl", "Real-time"],
  },
  {
    id: "exa-deep",
    name: "Exa Deep",
    provider: "Exa",
    description: "Exa deep web search for research-heavy responses",
    capabilities: ["Deep Search", "Research", "High Recall"],
  },
  {
    id: "auto",
    name: "Auto",
    provider: "SyntraIQ",
    description: "Automatically selects the best model",
    capabilities: ["Smart Selection", "Optimized", "Cost Effective"],
  },
  // OpenAI Models
  // OpenAI — latest tier
  {
    id: "gpt-5.5-pro",
    name: "GPT-5.5 Pro",
    provider: "OpenAI",
    description: "Highest OpenAI tier — maximum intelligence",
    capabilities: ["Max Intelligence", "Deep Reasoning", "Premium"],
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "OpenAI",
    description: "GPT-5.5 — top-tier OpenAI model",
    capabilities: ["Advanced Reasoning", "Latest Tech", "High Performance"],
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenAI",
    description: "GPT-5.4 high-performance model",
    capabilities: ["Reasoning", "Long Context", "Fast"],
  },
  {
    id: "o3",
    name: "o3",
    provider: "OpenAI",
    description: "OpenAI o3 reasoning model — deep multi-step reasoning",
    capabilities: ["Deep Reasoning", "Math", "Code", "Premium"],
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    provider: "OpenAI",
    description: "OpenAI o4-mini reasoning — fast and efficient",
    capabilities: ["Reasoning", "Fast", "Cost Effective"],
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    description: "GPT-5 flagship model",
    capabilities: ["Advanced Reasoning", "Latest Tech", "High Performance"],
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    provider: "OpenAI",
    description: "GPT-5.1 compatibility profile",
    capabilities: ["Reasoning", "Long Context", "Compatibility"],
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    provider: "OpenAI",
    description: "GPT-5.2 compatibility profile",
    capabilities: ["Reasoning", "Tool Use", "Compatibility"],
  },
  {
    id: "gpt-5.3",
    name: "GPT-5.3",
    provider: "OpenAI",
    description: "GPT-5.3 compatibility profile",
    capabilities: ["Advanced", "Fast", "Compatibility"],
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    description: "GPT-4.1 — improved coding and instruction following",
    capabilities: ["Coding", "Instruction", "Web Search"],
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "OpenAI",
    description: "GPT-4.1 Mini — fast and affordable",
    capabilities: ["Fast", "Efficient", "Cost Effective"],
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    provider: "OpenAI",
    description: "GPT-4.1 Nano — ultra-lightweight for simple tasks",
    capabilities: ["Ultra Fast", "Lightweight", "Free Tier"],
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "OpenAI's flagship model with optimized performance",
    capabilities: ["Fast", "Multimodal", "Advanced Reasoning"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    description: "Faster and more affordable GPT-4o variant",
    capabilities: ["Fast", "Cost Effective", "Efficient"],
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "OpenAI",
    description: "Enhanced GPT-4 with improved speed and capabilities",
    capabilities: ["Fast", "Long Context", "Advanced"],
  },
  // Google Gemini Models
  {
    id: "gemini-2.0-latest",
    name: "Gemini 2.0 Latest",
    provider: "Google",
    description: "Google's latest and most powerful model",
    capabilities: ["Latest Version", "Multimodal", "Advanced AI"],
  },
  {
    id: "gemini-3.0",
    name: "Gemini 3.0",
    provider: "Google",
    description: "Gemini 3.0 profile",
    capabilities: ["Latest", "Multimodal", "High Quality"],
  },
  {
    id: "gemini-3.1",
    name: "Gemini 3.1",
    provider: "Google",
    description: "Gemini 3.1 Pro profile",
    capabilities: ["Pro Quality", "Reasoning", "Tooling"],
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "Google",
    description: "Gemini 3.5 Flash — fast and highly capable",
    capabilities: ["Fast", "Multimodal", "Web Search"],
  },
  {
    id: "gemini-3.1-flash",
    name: "Gemini 3.1 Flash",
    provider: "Google",
    description: "Gemini 3.1 fast profile",
    capabilities: ["Fast", "Low Latency", "Multimodal"],
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "Google",
    description: "Gemini 3.1 Flash Lite — ultra-efficient",
    capabilities: ["Ultra Fast", "Lightweight", "Low Cost"],
  },
  // Anthropic Claude Models (Latest First)
  {
    id: "claude-4.8-opus",
    name: "Claude 4.8 Opus",
    provider: "Anthropic",
    description: "Claude 4.8 Opus — highest intelligence tier",
    capabilities: ["200K Context", "Max Intelligence", "Deep Analysis", "Premium"],
  },
  {
    id: "claude-4.7-opus",
    name: "Claude 4.7 Opus",
    provider: "Anthropic",
    description: "Claude 4.7 Opus — top-tier reasoning and analysis",
    capabilities: ["200K Context", "Deep Analysis", "Reasoning", "Latest"],
  },
  {
    id: "claude-4.6-sonnet",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Claude 4.6 Sonnet profile with strong reasoning and coding",
    capabilities: ["200K Context", "Reasoning", "Coding", "Latest"],
  },
  {
    id: "claude-4.6-opus",
    name: "Claude Opus 4.6",
    provider: "Anthropic",
    description: "Claude 4.6 Opus profile for maximum depth and quality",
    capabilities: ["200K Context", "Max Intelligence", "Deep Analysis", "Latest"],
  },
  {
    id: "claude-4.5-sonnet",
    name: "Claude 4.5 Sonnet",
    provider: "Anthropic",
    description: "Best coding model with 30+ hour autonomous operation",
    capabilities: ["200K Context", "Best Coding", "Autonomous", "Latest"],
  },
  {
    id: "claude-4.5-opus",
    name: "Claude 4.5 Opus",
    provider: "Anthropic",
    description: "Maximum intelligence with extended thinking support",
    capabilities: [
      "200K Context",
      "Max Intelligence",
      "Extended Thinking",
      "Latest",
    ],
  },
  {
    id: "claude-4.5-haiku",
    name: "Claude 4.5 Haiku",
    provider: "Anthropic",
    description: "Near-frontier quality with ultra-low latency",
    capabilities: ["200K Context", "Ultra Fast", "Cost Effective", "Latest"],
  },
  {
    id: "claude-4-sonnet",
    name: "Claude 4 Sonnet",
    provider: "Anthropic",
    description: "Balanced hybrid model with dual-mode reasoning",
    capabilities: ["200K Context", "Dual Mode", "Coding", "Balanced"],
  },
  {
    id: "claude-4-opus",
    name: "Claude Opus 4",
    provider: "Anthropic",
    description: "High-intelligence Claude Opus 4 profile",
    capabilities: ["200K Context", "Deep Analysis", "Reasoning", "Stable"],
  },
  {
    id: "claude-4.1-opus",
    name: "Claude Opus 4.1",
    provider: "Anthropic",
    description: "Refined Opus profile for complex reasoning",
    capabilities: ["200K Context", "Reasoning", "Reliable", "Advanced"],
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "Anthropic",
    description: "Fastest model for quick responses and high throughput",
    capabilities: ["200K Context", "Fast", "Cost Effective", "Lightweight"],
  },
  // xAI Grok Models (Latest First)
  {
    id: "grok-4.20",
    name: "Grok 4.20",
    provider: "xAI",
    description: "Grok 4.20 — highest Grok intelligence tier",
    capabilities: ["Max Intelligence", "Real-time", "Premium"],
  },
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    provider: "xAI",
    description: "Grok 4.3 — powerful and up-to-date",
    capabilities: ["Real-time Data", "Advanced", "Web Search"],
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xAI",
    description:
      "xAI's flagship model for enterprise tasks, coding, and data extraction",
    capabilities: ["Enterprise", "Coding", "Data Extraction", "131K Context"],
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xAI",
    description:
      "Lightweight reasoning model for agentic coding and math problems",
    capabilities: ["Fast", "Coding", "Math", "131K Context"],
  },
  {
    id: "grok-4-heavy",
    name: "Grok 4 Heavy",
    provider: "xAI",
    description: "Most powerful Grok model for complex problem-solving",
    capabilities: ["Complex Tasks", "Advanced Reasoning", "High Performance"],
  },
  {
    id: "grok-4-fast",
    name: "Grok 4 Fast",
    provider: "xAI",
    description: "Cost-efficient multimodal model with 2M token context",
    capabilities: ["Multimodal", "Fast", "2M Context", "Cost Efficient"],
  },
  {
    id: "grok-code-fast-1",
    name: "Grok Code Fast 1",
    provider: "xAI",
    description: "Specialized model for agentic coding with visible reasoning",
    capabilities: ["Coding", "Fast", "Reasoning Traces", "Agentic"],
  },
  {
    id: "grok-beta",
    name: "Grok Beta",
    provider: "xAI",
    description: "xAI's beta language model with real-time capabilities",
    capabilities: ["Real-time Data", "Fast Response", "Beta Features"],
  },
  // DeepSeek
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "Next-gen foundation model — strong general reasoning + coding",
    capabilities: ["Reasoning", "Coding", "Cost Effective"],
  },
  {
    id: "deepseek-v3.2-exp",
    name: "DeepSeek V3.2 Exp",
    provider: "DeepSeek",
    description: "Experimental DeepSeek V3.2 with sparse attention",
    capabilities: ["Experimental", "Long Context", "Reasoning"],
  },
  {
    id: "deepseek-v3.1",
    name: "DeepSeek V3.1",
    provider: "DeepSeek",
    description: "Hybrid thinking / non-thinking general model",
    capabilities: ["Hybrid Thinking", "General Purpose"],
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "Reasoning-focused — math, code, multi-step problems",
    capabilities: ["Deep Reasoning", "Math", "Code"],
  },
  // Kimi / Moonshot
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "Moonshot",
    description: "Moonshot AI's flagship agentic LLM — SOTA open model",
    capabilities: ["Agentic", "Long Context", "Tool Use"],
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    provider: "Moonshot",
    description: "General-purpose agentic reasoning — strong multi-step thinking",
    capabilities: ["Deep Thinking", "Agentic", "Reasoning"],
  },
  {
    id: "kimi-k2",
    name: "Kimi K2",
    provider: "Moonshot",
    description: "Mixture-of-experts language model — fast and capable",
    capabilities: ["MoE", "Fast", "General Purpose"],
  },
  // Perplexity Sonar
  {
    id: "perplexity-sonar-pro",
    name: "Perplexity Sonar Pro",
    provider: "Perplexity",
    description: "Agentic researcher — autonomous real-time web search",
    capabilities: ["Web Search", "Agentic", "Cited Answers"],
  },
  {
    id: "perplexity-sonar",
    name: "Perplexity Sonar",
    provider: "Perplexity",
    description: "Real-time, web-connected answers with citations",
    capabilities: ["Web Search", "Real-time", "Cited Answers"],
  },
  {
    id: "perplexity-sonar-reasoning-pro",
    name: "Perplexity Sonar Reasoning Pro",
    provider: "Perplexity",
    description: "R1-based reasoning model with live web grounding",
    capabilities: ["Deep Reasoning", "Web Search", "Cited Answers"],
  },
  {
    id: "perplexity-adv-deep-research",
    name: "Perplexity Advanced Deep Research",
    provider: "Perplexity",
    description: "Institutional-grade inquiry — long, sourced research reports",
    capabilities: ["Deep Research", "Long Reports", "Cited Answers"],
  },
  {
    id: "perplexity-deep-research",
    name: "Perplexity Deep Research",
    provider: "Perplexity",
    description: "Multi-source long-form research with citations",
    capabilities: ["Deep Research", "Multi-source", "Cited Answers"],
  },
];

// Legacy models (kept for backward compatibility, but not shown in selector)
const legacyModels: LLMModelInfo[] = [
  {
    id: "gpt-4",
    name: "GPT-4",
    provider: "OpenAI",
    description: "Most capable model for complex reasoning and analysis",
    capabilities: [
      "Reasoning",
      "Analysis",
      "Creative Writing",
      "Code Generation",
    ],
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "OpenAI",
    description: "Fast and efficient for most tasks",
    capabilities: ["General Purpose", "Fast Response", "Cost Effective"],
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "Google",
    description: "Google's advanced language model",
    capabilities: ["Multimodal", "Reasoning", "Code Generation"],
  },
  {
    id: "gemini-pro-vision",
    name: "Gemini Pro Vision",
    provider: "Google",
    description: "Multimodal model with vision capabilities",
    capabilities: ["Image Analysis", "Multimodal", "Vision"],
  },
  {
    id: "llama-2",
    name: "Llama 2",
    provider: "Meta",
    description: "Open-source large language model",
    capabilities: ["Open Source", "General Purpose", "Customizable"],
  },
  {
    id: "mistral-7b",
    name: "Mistral 7B",
    provider: "Mistral AI",
    description: "Efficient open-source model",
    capabilities: ["Efficient", "Open Source", "Fast"],
  },
];

interface LLMModelSelectorProps {
  selectedModel: LLMModel;
  onModelChange: (model: LLMModel) => void;
  disabled?: boolean;
  isPremium?: boolean;
  size?: "small" | "medium" | "large";
  experienceMode?: ExperienceMode;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
}

export const LLMModelSelector: React.FC<LLMModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  isPremium = false,
  size = "medium",
  experienceMode = 'normal',
  onExperienceModeChange: _onExperienceModeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollStartYRef = useRef<number | null>(null);
  const hasScrolledRef = useRef(false);
  const { navigateTo } = useRouterNavigation();

  // Use premium models if user is premium, otherwise return empty (shouldn't be shown)
  // Filter based on high-level experience mode:
  // - normal: hide the heaviest deep-research-only models
  // - web_search: show all premium models
  // - deep_research: show only the strongest deep research models
  const deepResearchIds: LLMModel[] = [
    'exa-deep',
    // OpenAI deep research / reasoning
    'gpt-5.5-pro', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3', 'gpt-5.2', 'gpt-5.1', 'gpt-5',
    'o3', 'o4-mini',
    // Grok heavy / premium
    'grok-4-heavy', 'grok-4-fast', 'grok-4.20',
    // Claude high-tier
    'claude-4.8-opus', 'claude-4.7-opus',
    'claude-4.6-opus', 'claude-4.6-sonnet',
    'claude-4.5-opus', 'claude-4.5-sonnet',
    'claude-4-opus', 'claude-4-sonnet',
    // Gemini pro
    'gemini-3.1', 'gemini-3.1-flash', 'gemini-3.5-flash', 'gemini-pro',
    // OpenAI mid
    'gpt-4o',
    // DeepSeek / Kimi / Perplexity — reasoning- and research-leaning models
    // belong in the deep_research filter. Sonar (live web search) stays out so
    // it surfaces in Web mode, not Deep.
    'deepseek-r1', 'deepseek-v3.2-exp',
    'kimi-k2-thinking', 'kimi-k2.5',
    'perplexity-sonar-reasoning-pro',
    'perplexity-deep-research',
    'perplexity-adv-deep-research',
  ];

  const filteredModels = premiumModels.filter((model) => {
    if (experienceMode === "web_search") return true;
    if (experienceMode === "deep_research") {
      return deepResearchIds.includes(model.id);
    }
    return !deepResearchIds.includes(model.id as LLMModel);
  });

  const premiumAvailableModels =
    experienceMode === "normal" || experienceMode === "web_search"
      ? [
          ...filteredModels.filter((model) => model.id === "auto"),
          ...filteredModels.filter((model) => model.id !== "auto"),
        ]
      : filteredModels;

  const availableModels = isPremium
    ? premiumAvailableModels
    : [
        FREE_TIER_MODEL,
        ...premiumAvailableModels.filter((model) => model.id !== "gemini-lite"),
      ];

  const allModelCatalog = [FREE_TIER_MODEL, ...premiumModels, ...legacyModels];

  // Find selected model info from premium or legacy models
  const selectedModelInfo =
    allModelCatalog.find((model) => model.id === selectedModel) || FREE_TIER_MODEL;

  const isModelLocked = (modelId: LLMModel) =>
    !isPremium && modelId !== "gemini-lite";

  const handleModelSelect = (modelId: LLMModel) => {
    if (isModelLocked(modelId)) {
      setIsOpen(false);
      navigateTo("/subscription", { plan: "pro", limitReached: true });
      return;
    }
    onModelChange(modelId);
    setIsOpen(false);
  };

  const handleSubscriptionTierSelect = (tier: SubscriptionTierOption) => {
    setIsOpen(false);
    navigateTo("/subscription", { plan: tier });
  };

  const triggerLabel =
    !isPremium && selectedModel === "gemini-lite"
      ? "Free"
      : selectedModelInfo?.name.slice(0, 10).concat(
          (selectedModelInfo?.name.length ?? 0) > 10 ? "…" : ""
        ) || "Free";

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle backdrop click to close (mobile only)
  useEffect(() => {
    if (!isOpen || !isMobile || !backdropRef.current) return;

    const handleBackdropClick = (e: MouseEvent) => {
      // Only close if clicking directly on backdrop
      if (e.target === backdropRef.current) {
        setIsOpen(false);
      }
    };

    const backdrop = backdropRef.current;
    backdrop.addEventListener("click", handleBackdropClick);

    return () => {
      backdrop.removeEventListener("click", handleBackdropClick);
    };
  }, [isOpen, isMobile]);

  // Handle click outside for desktop
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!desktopDropdownRef.current ||
          !desktopDropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile]);

  // Handle scroll detection in mobile dropdown
  const handleScrollStart = (e: React.TouchEvent) => {
    scrollStartYRef.current = e.touches[0].clientY;
    hasScrolledRef.current = false;
  };

  const handleScrollMove = (e: React.TouchEvent) => {
    if (scrollStartYRef.current !== null && e.touches[0]) {
      const deltaY = Math.abs(e.touches[0].clientY - scrollStartYRef.current);
      if (deltaY > 10) {
        hasScrolledRef.current = true;
      }
    }
  };

  const handleScrollEnd = () => {
    // Reset after a delay to allow any click events to check
    setTimeout(() => {
      hasScrolledRef.current = false;
      scrollStartYRef.current = null;
    }, 200);
  };

  // Handle model button click/tap
  const handleModelButtonClick = (
    modelId: LLMModel,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    // Don't select if we just scrolled
    if (hasScrolledRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    handleModelSelect(modelId);
  };

  // Size-based styles
  const sizeStyles = {
    small: {
      padding: "2px 4px",
      fontSize: "var(--font-sm)",
      iconSize: 6,
      gap: 4,
      minWidth: 56,
      indicatorSize: 10,
      height: "28px", // Match w-7 h-7 buttons
    },
    medium: {
      padding: "4px 8px",
      fontSize: "var(--font-sm)",
      iconSize: 8,
      gap: 6,
      minWidth: 80,
      indicatorSize: 12,
      height: "auto",
    },
    large: {
      padding: "8px 16px",
      fontSize: "var(--font-sm)",
      iconSize: 10,
      gap: 8,
      minWidth: 150,
      indicatorSize: 14,
      height: "auto",
    },
  };

  const currentSize = sizeStyles[size];

  const renderSubscriptionTierButton = (
    tier: (typeof SUBSCRIPTION_TIER_OPTIONS)[number],
    isMobileView: boolean
  ) => (
    <button
      key={tier.id}
      type="button"
      onMouseDown={
        isMobileView
          ? undefined
          : (e) => {
              e.preventDefault();
              handleSubscriptionTierSelect(tier.id);
            }
      }
      onTouchEnd={
        isMobileView
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSubscriptionTierSelect(tier.id);
            }
          : undefined
      }
      onClick={
        isMobileView ? undefined : () => handleSubscriptionTierSelect(tier.id)
      }
      style={{
        width: "100%",
        padding: isMobileView ? "8px 12px" : "12px 16px",
        border: "none",
        backgroundColor: "transparent",
        textAlign: "left",
        cursor: "pointer",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: isMobileView ? 8 : 12,
        transition: "background-color 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (!isMobileView) {
          e.currentTarget.style.backgroundColor = "var(--border)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isMobileView) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <ProviderLogo provider={tier.provider} size={isMobileView ? 24 : 26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "var(--font-sm)",
            marginBottom: isMobileView ? 1 : 2,
            color: "var(--text)",
          }}
        >
          {tier.name}
        </div>
        <div
          style={{
            fontSize: isMobileView ? "var(--font-xs)" : "var(--font-sm)",
            color: "var(--sub)",
            marginBottom: isMobileView ? 2 : 4,
          }}
        >
          {tier.provider}
        </div>
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--sub)",
            lineHeight: isMobileView ? "12px" : "14px",
          }}
        >
          {tier.description}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: isMobileView ? 3 : 4,
            marginTop: isMobileView ? 4 : 6,
          }}
        >
          {tier.capabilities.slice(0, isMobileView ? 2 : 3).map((capability) => (
            <span
              key={capability}
              style={{
                fontSize: "var(--font-xs)",
                padding: isMobileView ? "1px 4px" : "2px 6px",
                backgroundColor: "var(--border)",
                borderRadius: isMobileView ? 3 : 4,
                color: "var(--sub)",
              }}
            >
              {capability}
            </span>
          ))}
        </div>
      </div>
      <span
        style={{
          fontSize: "var(--font-xs)",
          fontWeight: 600,
          color: "var(--accent)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        Upgrade
      </span>
    </button>
  );

  const renderModelButton = (model: LLMModelInfo, isMobileView: boolean) => {
    const locked = isModelLocked(model.id);
    return (
    <button
      key={model.id}
      onMouseDown={
        isMobileView
          ? undefined
          : (e) => {
            e.preventDefault();
            handleModelSelect(model.id);
          }
      }
      onTouchStart={isMobileView ? handleScrollStart : undefined}
      onTouchMove={isMobileView ? handleScrollMove : undefined}
      onTouchEnd={
        isMobileView
          ? (e) => {
            handleScrollEnd();
            handleModelButtonClick(model.id, e);
          }
          : undefined
      }
      onClick={isMobileView ? undefined : () => handleModelSelect(model.id)}
      style={{
        width: "100%",
        padding: isMobileView ? "8px 12px" : "12px 16px",
        border: "none",
        backgroundColor: "transparent",
        textAlign: "left",
        cursor: "pointer",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: isMobileView ? 8 : 12,
        transition: "background-color 0.2s ease",
        opacity: locked ? 0.72 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isMobileView) {
          e.currentTarget.style.backgroundColor = "var(--border)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isMobileView) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <ProviderLogo provider={model.provider} modelId={model.id} size={isMobileView ? 24 : 26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: isMobileView ? "var(--font-sm)" : "var(--font-sm)",
            marginBottom: isMobileView ? 1 : 2,
            color: "var(--text)",
          }}
        >
          {model.name}
        </div>
        <div
          style={{
            fontSize: isMobileView ? "var(--font-xs)" : "var(--font-sm)",
            color: "var(--sub)",
            marginBottom: isMobileView ? 2 : 4,
          }}
        >
          {model.provider}
        </div>
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--sub)",
            lineHeight: isMobileView ? "12px" : "14px",
          }}
        >
          {model.description}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: isMobileView ? 3 : 4,
            marginTop: isMobileView ? 4 : 6,
          }}
        >
          {model.capabilities
            .slice(0, isMobileView ? 2 : 3)
            .map((capability) => (
              <span
                key={capability}
                style={{
                  fontSize: "var(--font-xs)",
                  padding: isMobileView ? "1px 4px" : "2px 6px",
                  backgroundColor: "var(--border)",
                  borderRadius: isMobileView ? 3 : 4,
                  color: "var(--sub)",
                }}
              >
                {capability}
              </span>
            ))}
        </div>
      </div>
      {locked && (
        <span
          style={{
            fontSize: "var(--font-xs)",
            fontWeight: 600,
            color: "var(--accent)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          IQ Pro/Max
        </span>
      )}
      {selectedModel === model.id && !locked && (
        <div
          style={{
            width: isMobileView ? 14 : 16,
            height: isMobileView ? 14 : 16,
            borderRadius: "50%",
            backgroundColor: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--font-xs)",
            color: "#111",
            flexShrink: 0,
          }}
        >
          ✓
        </div>
      )}
    </button>
    );
  };

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <>
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          className="btn-ghost glass-button btn-shadow max-md:!h-[32px] max-md:!min-h-[32px] max-md:!py-0 max-md:!px-[6px]"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: currentSize.gap,
            minWidth: currentSize.minWidth,
            maxWidth: "100%",
            padding: currentSize.padding,
            fontSize: currentSize.fontSize,
            height: currentSize.height,
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: currentSize.gap,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <ProviderLogo
              provider={selectedModelInfo?.provider}
              modelId={selectedModel}
              size={Math.max(currentSize.iconSize + 8, 16)}
            />
            <span className="font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {triggerLabel}
            </span>
          </div>
          <span style={{ fontSize: currentSize.fontSize, opacity: 0.7, flexShrink: 0 }}>
            ▲
          </span>
        </button>

        {isOpen &&
          createPortal(
            <>
              <div
                ref={backdropRef}
                onClick={() => setIsOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  zIndex: 99998,
                }}
              />
              <div
                ref={isMobile ? mobileDropdownRef : desktopDropdownRef}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="glass-panel bottom-sheet-safe-bottom"
                style={{
                  position: "fixed",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 99999,
                  maxHeight: "70vh",
                  overflowY: "auto",
                  borderRadius: "16px 16px 0 0",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
                  <div style={{ width: 40, height: 4, borderRadius: 999, background: "var(--border)" }} />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "0 16px 8px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-sm)" }}>Select model</div>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--sub)" }}>
                      {selectedModelInfo?.name || "Choose an AI model"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close model selector"
                    className="btn-ghost"
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "var(--text)",
                      background: "var(--input-bg)",
                    }}
                  >
                    <FaTimes size={14} />
                  </button>
                </div>
                {!isPremium && (
                  <div
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--border)",
                      fontSize: "var(--font-xs)",
                      color: "var(--sub)",
                      lineHeight: 1.45,
                    }}
                  >
                    Free is selected by default. Upgrade to IQ Pro or IQ Max for all premium models.
                  </div>
                )}
                {!isPremium ? (
                  <>
                    {renderModelButton(FREE_TIER_MODEL, isMobile)}
                    {SUBSCRIPTION_TIER_OPTIONS.map((tier) =>
                      renderSubscriptionTierButton(tier, isMobile)
                    )}
                  </>
                ) : (
                  availableModels.map((model) => renderModelButton(model, isMobile))
                )}
              </div>
            </>,
            document.body
          )}
      </div>
    </>
  );
};
