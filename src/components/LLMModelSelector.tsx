import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { LLMModel, LLMModelInfo } from '../types';

// Premium models available to premium users
const premiumModels: LLMModelInfo[] = [
  {
    id: 'auto',
    name: 'Auto',
    provider: 'Perlé',
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
  // {
  //   id: 'grok-4', // COMMENTED OUT - temporarily disabled
  //   name: 'Grok 4',
  //   provider: 'xAI',
  //   description: 'Latest Grok model with enhanced performance and features',
  //   capabilities: ['Latest', 'Advanced Reasoning', 'High Performance']
  // },
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
  // Anthropic Claude Models (COMMENTED OUT - No API key)
  // {
  //   id: 'claude-4.5',
  //   name: 'Claude 4.5',
  //   provider: 'Anthropic',
  //   description: 'Anthropic\'s latest and most capable model',
  //   capabilities: ['Advanced Reasoning', 'Long Context', 'Safety Focused']
  // }
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
  // {
  //   id: 'claude-3-opus',
  //   name: 'Claude 3 Opus',
  //   provider: 'Anthropic',
  //   description: 'Most powerful Claude model for complex tasks',
  //   capabilities: ['Advanced Reasoning', 'Long Context', 'Analysis']
  // },
  // {
  //   id: 'claude-3-sonnet',
  //   name: 'Claude 3 Sonnet',
  //   provider: 'Anthropic',
  //   description: 'Balanced performance and speed',
  //   capabilities: ['Balanced Performance', 'Code Generation', 'Analysis']
  // },
  // {
  //   id: 'claude-3-haiku',
  //   name: 'Claude 3 Haiku',
  //   provider: 'Anthropic',
  //   description: 'Fast and lightweight for simple tasks',
  //   capabilities: ['Fast Response', 'Simple Tasks', 'Cost Effective']
  // },
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
}

export const LLMModelSelector: React.FC<LLMModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  isPremium = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <>
      {isOpen && isMobile && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99998
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          className="btn-ghost"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--font-sm)',
            minWidth: 120,
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: selectedModelInfo?.provider === 'OpenAI' ? '#10A37F' :
                              selectedModelInfo?.provider === 'Anthropic' ? '#D97706' :
                              selectedModelInfo?.provider === 'Google' ? '#4285F4' :
                              selectedModelInfo?.provider === 'xAI' ? '#000000' :
                              selectedModelInfo?.provider === 'Perlé' ? '#6366F1' :
                              selectedModelInfo?.provider === 'Meta' ? '#1877F2' :
                              selectedModelInfo?.provider === 'Mistral AI' ? '#7C3AED' : '#6B7280'
            }} />
            <span>{selectedModelInfo?.name || 'Select Model'}</span>
          </div>
          <span style={{ fontSize: 'var(--font-sm)', opacity: 0.7 }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </button>

        {isOpen && (
          isMobile ? createPortal(
            <div style={{
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
              minWidth: '100%'
            }}>
              {availableModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--border)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: model.provider === 'OpenAI' ? '#10A37F' :
                                    model.provider === 'Anthropic' ? '#D97706' :
                                    model.provider === 'Google' ? '#4285F4' :
                                    model.provider === 'xAI' ? '#000000' :
                                    model.provider === 'Perlé' ? '#6366F1' :
                                    model.provider === 'Meta' ? '#1877F2' :
                                    model.provider === 'Mistral AI' ? '#7C3AED' : '#6B7280',
                    flexShrink: 0
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      fontSize: 'var(--font-sm)',
                      marginBottom: 1,
                      color: 'var(--text)'
                    }}>
                      {model.name}
                    </div>
                    <div style={{ 
                      fontSize: 'var(--font-xs)', 
                      color: 'var(--sub)',
                      marginBottom: 2
                    }}>
                      {model.provider}
                    </div>
                    <div style={{ 
                      fontSize: 'var(--font-xs)', 
                      color: 'var(--sub)',
                      lineHeight: '12px'
                    }}>
                      {model.description}
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: 3, 
                      marginTop: 4 
                    }}>
                      {model.capabilities.slice(0, 2).map((capability) => (
                        <span
                          key={capability}
                          style={{
                            fontSize: 'var(--font-xs)',
                            padding: '1px 4px',
                            backgroundColor: 'var(--border)',
                            borderRadius: 3,
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
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--font-xs)',
                      color: '#111'
                    }}>
                      ✓
                    </div>
                  )}
                </button>
              ))}
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
          {availableModels.map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelSelect(model.id)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: model.provider === 'OpenAI' ? '#10A37F' :
                                model.provider === 'Anthropic' ? '#D97706' :
                                model.provider === 'Google' ? '#4285F4' :
                                model.provider === 'xAI' ? '#000000' :
                                model.provider === 'Perlé' ? '#6366F1' :
                                model.provider === 'Meta' ? '#1877F2' :
                                model.provider === 'Mistral AI' ? '#7C3AED' : '#6B7280',
                flexShrink: 0
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: 'var(--font-sm)',
                  marginBottom: 2,
                  color: 'var(--text)'
                }}>
                  {model.name}
                </div>
                <div style={{ 
                  fontSize: 'var(--font-sm)', 
                  color: 'var(--sub)',
                  marginBottom: 4
                }}>
                  {model.provider}
                </div>
                <div style={{ 
                  fontSize: 'var(--font-xs)', 
                  color: 'var(--sub)',
                  lineHeight: '14px'
                }}>
                  {model.description}
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 4, 
                  marginTop: 6 
                }}>
                  {model.capabilities.slice(0, 3).map((capability) => (
                    <span
                      key={capability}
                      style={{
                        fontSize: 'var(--font-xs)',
                        padding: '2px 6px',
                        backgroundColor: 'var(--border)',
                        borderRadius: 4,
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
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--font-xs)',
                  color: '#111'
                }}>
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>
          )
        )}
      </div>
    </>
  );
};
