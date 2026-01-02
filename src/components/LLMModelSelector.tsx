import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import type { LLMModel, LLMModelInfo } from '../types';

// Premium models available to premium users
const premiumModels: LLMModelInfo[] = [
  {
    id: 'auto',
    name: 'Auto',
    provider: 'SyntraIQ',
    description: 'Automatically selects the best model',
    capabilities: ['Smart Selection', 'Optimized', 'Cost Effective']
  },
  // OpenAI Models
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'OpenAI',
    description: 'Latest and most advanced OpenAI model (GPT-4o)',
    capabilities: ['Advanced Reasoning', 'Latest Tech', 'High Performance']
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'OpenAI\'s flagship model with optimized performance',
    capabilities: ['Fast', 'Multimodal', 'Advanced Reasoning']
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Faster and more affordable GPT-4o variant',
    capabilities: ['Fast', 'Cost Effective', 'Efficient']
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    description: 'Enhanced GPT-4 with improved speed and capabilities',
    capabilities: ['Fast', 'Long Context', 'Advanced']
  },
  // Google Gemini Models
  {
    id: 'gemini-2.0-latest',
    name: 'Gemini 2.0 Latest',
    provider: 'Google',
    description: 'Google\'s latest and most powerful model',
    capabilities: ['Latest Version', 'Multimodal', 'Advanced AI']
  },
  // Anthropic Claude Models (Latest First)
  {
    id: 'claude-4.5-sonnet',
    name: 'Claude 4.5 Sonnet',
    provider: 'Anthropic',
    description: 'Best coding model with 30+ hour autonomous operation',
    capabilities: ['200K Context', 'Best Coding', 'Autonomous', 'Latest']
  },
  {
    id: 'claude-4.5-opus',
    name: 'Claude 4.5 Opus',
    provider: 'Anthropic',
    description: 'Maximum intelligence with extended thinking support',
    capabilities: ['200K Context', 'Max Intelligence', 'Extended Thinking', 'Latest']
  },
  {
    id: 'claude-4.5-haiku',
    name: 'Claude 4.5 Haiku',
    provider: 'Anthropic',
    description: 'Near-frontier quality with ultra-low latency',
    capabilities: ['200K Context', 'Ultra Fast', 'Cost Effective', 'Latest']
  },
  {
    id: 'claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    provider: 'Anthropic',
    description: 'Balanced hybrid model with dual-mode reasoning',
    capabilities: ['200K Context', 'Dual Mode', 'Coding', 'Balanced']
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Most intelligent model for complex tasks, coding, and analysis',
    capabilities: ['200K Context', 'Advanced Reasoning', 'Coding', 'Fast']
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    description: 'Top-level performance for demanding tasks and analysis',
    capabilities: ['200K Context', 'Advanced', 'Reasoning', 'Multimodal']
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    description: 'Balanced performance and speed for everyday tasks',
    capabilities: ['200K Context', 'Balanced', 'Efficient', 'Multimodal']
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    description: 'Fastest model for quick responses and high throughput',
    capabilities: ['200K Context', 'Fast', 'Cost Effective', 'Lightweight']
  },
  // xAI Grok Models
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xAI',
    description: 'xAI\'s flagship model for enterprise tasks, coding, and data extraction',
    capabilities: ['Enterprise', 'Coding', 'Data Extraction', '131K Context']
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'xAI',
    description: 'Lightweight reasoning model for agentic coding and math problems',
    capabilities: ['Fast', 'Coding', 'Math', '131K Context']
  },
  {
    id: 'grok-4-heavy',
    name: 'Grok 4 Heavy',
    provider: 'xAI',
    description: 'Most powerful Grok model for complex problem-solving',
    capabilities: ['Complex Tasks', 'Advanced Reasoning', 'High Performance']
  },
  {
    id: 'grok-4-fast',
    name: 'Grok 4 Fast',
    provider: 'xAI',
    description: 'Cost-efficient multimodal model with 2M token context',
    capabilities: ['Multimodal', 'Fast', '2M Context', 'Cost Efficient']
  },
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    provider: 'xAI',
    description: 'Specialized model for agentic coding with visible reasoning',
    capabilities: ['Coding', 'Fast', 'Reasoning Traces', 'Agentic']
  },
  {
    id: 'grok-beta',
    name: 'Grok Beta',
    provider: 'xAI',
    description: 'xAI\'s beta language model with real-time capabilities',
    capabilities: ['Real-time Data', 'Fast Response', 'Beta Features']
  },
];

// Legacy models (kept for backward compatibility, but not shown in selector)
const legacyModels: LLMModelInfo[] = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'OpenAI',
    description: 'Most capable model for complex reasoning and analysis',
    capabilities: ['Reasoning', 'Analysis', 'Creative Writing', 'Code Generation']
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    description: 'Fast and efficient for most tasks',
    capabilities: ['General Purpose', 'Fast Response', 'Cost Effective']
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    description: 'Google\'s advanced language model',
    capabilities: ['Multimodal', 'Reasoning', 'Code Generation']
  },
  {
    id: 'gemini-pro-vision',
    name: 'Gemini Pro Vision',
    provider: 'Google',
    description: 'Multimodal model with vision capabilities',
    capabilities: ['Image Analysis', 'Multimodal', 'Vision']
  },
  {
    id: 'llama-2',
    name: 'Llama 2',
    provider: 'Meta',
    description: 'Open-source large language model',
    capabilities: ['Open Source', 'General Purpose', 'Customizable']
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    provider: 'Mistral AI',
    description: 'Efficient open-source model',
    capabilities: ['Efficient', 'Open Source', 'Fast']
  }
];

interface LLMModelSelectorProps {
  selectedModel: LLMModel;
  onModelChange: (model: LLMModel) => void;
  disabled?: boolean;
  isPremium?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const LLMModelSelector: React.FC<LLMModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  isPremium = false,
  size = 'medium'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollStartYRef = useRef<number | null>(null);
  const hasScrolledRef = useRef(false);
  const { navigateTo } = useRouterNavigation();

  // Use premium models if user is premium, otherwise return empty (shouldn't be shown)
  const availableModels = isPremium ? premiumModels : [];

  // Find selected model info from premium or legacy models
  const selectedModelInfo = premiumModels.find(model => model.id === selectedModel) ||
    legacyModels.find(model => model.id === selectedModel);

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
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
    backdrop.addEventListener('click', handleBackdropClick);

    return () => {
      backdrop.removeEventListener('click', handleBackdropClick);
    };
  }, [isOpen, isMobile]);

  // Handle click outside for desktop
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
  const handleModelButtonClick = (modelId: LLMModel, e: React.MouseEvent | React.TouchEvent) => {
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
      case 'OpenAI': return '#10A37F';
      case 'Anthropic': return '#D97706';
      case 'Google': return '#4285F4';
      case 'xAI': return '#000000';
      case 'SyntraIQ': return '#6366F1';
      case 'Meta': return '#1877F2';
      case 'Mistral AI': return '#7C3AED';
      default: return '#6B7280';
    }
  };

  // Size-based styles
  const sizeStyles = {
    small: {
      padding: '2px 4px',
      fontSize: 'var(--font-xs)',
      iconSize: 6,
      gap: 4,
      minWidth: 70,
      indicatorSize: 10,
      height: '28px' // Match w-7 h-7 buttons
    },
    medium: {
      padding: '6px 12px',
      fontSize: 'var(--font-xs)',
      iconSize: 8,
      gap: 6,
      minWidth: 120,
      indicatorSize: 12,
      height: 'auto'
    },
    large: {
      padding: '8px 16px',
      fontSize: 'var(--font-sm)',
      iconSize: 10,
      gap: 8,
      minWidth: 150,
      indicatorSize: 14,
      height: 'auto'
    }
  };

  const currentSize = sizeStyles[size];

  const renderModelButton = (model: LLMModelInfo, isMobileView: boolean) => (
    <button
      key={model.id}
      onMouseDown={isMobileView ? undefined : (e) => {
        e.preventDefault();
        handleModelSelect(model.id);
      }}
      onTouchStart={isMobileView ? handleScrollStart : undefined}
      onTouchMove={isMobileView ? handleScrollMove : undefined}
      onTouchEnd={isMobileView ? (e) => {
        handleScrollEnd();
        handleModelButtonClick(model.id, e);
      } : undefined}
      onClick={isMobileView ? undefined : () => handleModelSelect(model.id)}
      style={{
        width: '100%',
        padding: isMobileView ? '8px 12px' : '12px 16px',
        border: 'none',
        backgroundColor: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: isMobileView ? 8 : 12,
        transition: 'background-color 0.2s ease'
      }}
      onMouseEnter={(e) => {
        if (!isMobileView) {
          e.currentTarget.style.backgroundColor = 'var(--border)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isMobileView) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: getProviderColor(model.provider),
        flexShrink: 0
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700,
          fontSize: isMobileView ? 'var(--font-sm)' : 'var(--font-sm)',
          marginBottom: isMobileView ? 1 : 2,
          color: 'var(--text)'
        }}>
          {model.name}
        </div>
        <div style={{
          fontSize: isMobileView ? 'var(--font-xs)' : 'var(--font-sm)',
          color: 'var(--sub)',
          marginBottom: isMobileView ? 2 : 4
        }}>
          {model.provider}
        </div>
        <div style={{
          fontSize: 'var(--font-xs)',
          color: 'var(--sub)',
          lineHeight: isMobileView ? '12px' : '14px'
        }}>
          {model.description}
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: isMobileView ? 3 : 4,
          marginTop: isMobileView ? 4 : 6
        }}>
          {model.capabilities.slice(0, isMobileView ? 2 : 3).map((capability) => (
            <span
              key={capability}
              style={{
                fontSize: 'var(--font-xs)',
                padding: isMobileView ? '1px 4px' : '2px 6px',
                backgroundColor: 'var(--border)',
                borderRadius: isMobileView ? 3 : 4,
                color: 'var(--sub)'
              }}
            >
              {capability}
            </span>
          ))}
        </div>
      </div>
      {selectedModel === model.id && (
        <div style={{
          width: isMobileView ? 14 : 16,
          height: isMobileView ? 14 : 16,
          borderRadius: '50%',
          backgroundColor: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--font-xs)',
          color: '#111',
          flexShrink: 0
        }}>
          ✓
        </div>
      )}
    </button>
  );

  return (
    <>
      {isOpen && isMobile && (
        <div
          ref={backdropRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99998
          }}
        />
      )}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          className="btn-ghost !border-[#dfb768]"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: currentSize.gap,
            minWidth: currentSize.minWidth,
            padding: currentSize.padding,
            fontSize: currentSize.fontSize,
            height: currentSize.height,
            justifyContent: 'space-between',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: currentSize.gap }}>
            <div style={{
              width: currentSize.iconSize,
              height: currentSize.iconSize,
              borderRadius: '50%',
              backgroundColor: getProviderColor(selectedModelInfo?.provider),
            }} />
            <span>{selectedModelInfo?.name || 'Select Model'}</span>
          </div>
          <span style={{ fontSize: currentSize.fontSize, opacity: 0.7 }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </button>

        {isOpen && (
          isMobile ? createPortal(
            <div
              ref={mobileDropdownRef}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: '120px',
                left: 0,
                right: 0,
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                zIndex: 99999,
                maxHeight: '300px',
                overflowY: 'auto',
                minWidth: '100%',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y' // Allow vertical scrolling
              }}
            >
              {!isPremium && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigateTo('/upgrade');
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    backgroundColor: 'var(--accent-light)', // Highlight background
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: 'var(--accent)',
                    fontWeight: 600,
                  }}
                >
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '14px'
                  }}>
                    ★
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--font-sm)' }}>Upgrade Plan</div>
                    <div style={{ fontSize: 'var(--font-xs)', opacity: 0.8, fontWeight: 400 }}>Unlock premium models</div>
                  </div>
                </button>
              )}
              {availableModels.map((model) => renderModelButton(model, true))}
            </div>,
            document.body
          ) : (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow)',
              zIndex: 99999,
              maxHeight: 300,
              overflowY: 'auto',
              marginTop: 4,
              minWidth: 280
            }}>
              {!isPremium && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigateTo('/upgrade');
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    border: 'none',
                    backgroundColor: 'var(--accent-light, #f0f9ff)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: 'var(--accent)',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--border)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--accent-light, #f0f9ff)';
                  }}
                >
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '12px',
                    flexShrink: 0
                  }}>
                    ★
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--font-sm)' }}>Upgrade Plan</div>
                    <div style={{ fontSize: 'var(--font-xs)', opacity: 0.8, fontWeight: 400, color: 'var(--text)' }}>Unlock premium models</div>
                  </div>
                </button>
              )}
              {availableModels.map((model) => renderModelButton(model, false))}
            </div>
          )
        )}
      </div >
    </>
  );
};
