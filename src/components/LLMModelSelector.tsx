import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import type { LLMModel, LLMModelInfo, ExperienceMode } from "../types";
import { getAuthToken, getUserData } from "../utils/auth";

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
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    description: "Latest and most advanced OpenAI model (GPT-4o)",
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
    id: "gemini-3.1-flash",
    name: "Gemini 3.1 Flash",
    provider: "Google",
    description: "Gemini 3.1 fast profile",
    capabilities: ["Fast", "Low Latency", "Multimodal"],
  },
  // Anthropic Claude Models (Latest First)
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
  // xAI Grok Models
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
  onExperienceModeChange,
}) => {
  const hasActiveAuthSession = (): boolean =>
    Boolean(getAuthToken() && getUserData());

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
    'gpt-5.3',
    'gpt-5.2',
    'gpt-5.1',
    'gpt-5',
    'gpt-4o',
    'grok-4-heavy',
    'grok-4-fast',
    'claude-4.6-opus',
    'claude-4.6-sonnet',
    'claude-4.5-opus',
    'claude-4.5-sonnet',
    'claude-4-opus',
    'claude-4-sonnet',
    'gemini-3.1',
    'gemini-3.1-flash',
  ];

  const filteredModels = isPremium
    ? premiumModels.filter((model) => {
        if (experienceMode === 'web_search') return true;
        if (experienceMode === 'deep_research') {
          return deepResearchIds.includes(model.id);
        }
        // normal: exclude deepest research-only models
        return !deepResearchIds.includes(model.id as LLMModel);
      })
    : [];

  const availableModels =
    experienceMode === 'normal' || experienceMode === 'web_search'
      ? [
          ...filteredModels.filter((model) => model.id === 'auto'),
          ...filteredModels.filter((model) => model.id !== 'auto'),
        ]
      : filteredModels;

  // Find selected model info from premium or legacy models
  const selectedModelInfo =
    premiumModels.find((model) => model.id === selectedModel) ||
    legacyModels.find((model) => model.id === selectedModel);

  const handleModelSelect = (modelId: LLMModel) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

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

  const getProviderColor = (provider?: string) => {
    switch (provider) {
      case "OpenAI":
        return "#10A37F";
      case "Anthropic":
        return "#D97706";
      case "Google":
        return "#4285F4";
      case "xAI":
        return "#000000";
      case "SyntraIQ":
        return "#6366F1";
      case "Exa":
        return "#22C55E";
      case "Meta":
        return "#1877F2";
      case "Mistral AI":
        return "#7C3AED";
      default:
        return "#6B7280";
    }
  };

  // Size-based styles
  const sizeStyles = {
    small: {
      padding: "2px 4px",
      fontSize: "var(--font-sm)",
      iconSize: 6,
      gap: 4,
      minWidth: 70,
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

  const renderModelButton = (model: LLMModelInfo, isMobileView: boolean) => (
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
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: getProviderColor(model.provider),
          flexShrink: 0,
        }}
      />
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
      {selectedModel === model.id && (
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

  const dropdownRect = dropdownRef.current?.getBoundingClientRect();

  return (
    <>
      {isOpen && isMobile && (
        <div
          ref={backdropRef}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99998,
          }}
        />
      )}
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          className="btn-ghost glass-button btn-shadow max-md:!h-[34px] max-md:!min-h-[34px] max-md:!py-0 max-md:!px-[8px]"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: currentSize.gap,
            minWidth: currentSize.minWidth,
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
            }}
          >
            <div
              style={{
                width: currentSize.iconSize,
                height: currentSize.iconSize,
                borderRadius: "50%",
                backgroundColor: getProviderColor(selectedModelInfo?.provider),
              }}
            />
            <span className="font-medium">
              {selectedModelInfo?.name.slice(0, 4).concat('...') || "Select Model"}
            </span>
          </div>
          <span style={{ fontSize: currentSize.fontSize, opacity: 0.7 }}>
            {isOpen ? "▲" : "▼"}
          </span>
        </button>

        {isOpen &&
          (isMobile ? (
            createPortal(
              <div
                ref={mobileDropdownRef}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="glass-panel"
                style={{
                  position: "fixed",
                  top: "120px",
                  left: 0,
                  right: 0,
                  zIndex: 99999,
                  maxHeight: "300px",
                  overflowY: "auto",
                  minWidth: "100%",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y", // Allow vertical scrolling
                }}
              >
                  {/* Mode Selector Section */}
                  <div style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    backgroundColor: "rgba(0,0,0,0.02)"
                  }}>
                    {(['normal', 'web_search', 'deep_research'] as ExperienceMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={(e) => {
                          e.stopPropagation();
                          onExperienceModeChange?.(mode);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontSize: "var(--font-xs)",
                          fontWeight: 600,
                          backgroundColor: experienceMode === mode ? "var(--accent)" : "transparent",
                          color: experienceMode === mode ? "black" : "var(--text)",
                          border: "1px solid var(--border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {mode === 'normal' ? 'Normal' : mode === 'web_search' ? 'Web search' : 'Deep research'}
                      </button>
                    ))}
                  </div>

                  {!isPremium && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigateTo(hasActiveAuthSession() ? "/subscription" : "/profile");
                    }}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      color: "var(--accent)",
                      fontWeight: 600,
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        backgroundColor: "var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    >
                      ★
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-sm)" }}>
                        Upgrade Plan
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-xs)",
                          opacity: 0.8,
                          fontWeight: 400,
                        }}
                      >
                        Unlock premium models
                      </div>
                    </div>
                  </button>
                )}
                {availableModels.map((model) => renderModelButton(model, true))}
              </div>,
              document.body
            )
          ) : (
            createPortal(
            <div
              ref={desktopDropdownRef}
              className="glass-panel no-scrollbar"
              style={{
                position: "fixed",
                left: dropdownRect ? dropdownRect.left : 0,
                bottom: dropdownRect
                  ? window.innerHeight - dropdownRect.top + 4
                  : 0,
                zIndex: 99999,
                maxHeight: 300,
                overflowY: "auto",
                minWidth: Math.max(dropdownRect?.width ?? 300, 300),
              }}
            >
              {/* Mode Selector Section (Desktop) */}
              <div style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: 8,
                backgroundColor: "rgba(0,0,0,0.02)"
              }}>
                {(['normal', 'web_search', 'deep_research'] as ExperienceMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExperienceModeChange?.(mode);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: "var(--font-xs)",
                      fontWeight: 600,
                      backgroundColor: experienceMode === mode ? "var(--accent)" : "transparent",
                      color: experienceMode === mode ? "black" : "var(--text)",
                      border: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    {mode === 'normal' ? 'Normal' : mode === 'web_search' ? 'Web search' : 'Deep research'}
                  </button>
                ))}
              </div>

              {!isPremium && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigateTo(hasActiveAuthSession() ? "/subscription" : "/profile");
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      backgroundColor: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "12px",
                      flexShrink: 0,
                    }}
                  >
                    ★
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-sm)" }}>
                      Upgrade Plan
                    </div>
                    <div
                      style={{
                        fontSize: "var(--font-xs)",
                        opacity: 0.8,
                        fontWeight: 400,
                        color: "var(--text)",
                      }}
                    >
                      Unlock premium models
                    </div>
                  </div>
                </button>
              )}
              {availableModels.map((model) => renderModelButton(model, false))}
            </div>,
            document.body
            )
          ))}
      </div>
    </>
  );
};
