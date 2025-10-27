import React, { useState } from 'react';
import type { AnswerChunk, Source, Mode } from '../types';
import { SourceChip } from './SourceChip';
import { copyToClipboard, shareContent } from '../utils/helpers';

interface AnswerCardProps {
  chunks: AnswerChunk[];
  sources: Source[];
  isLoading: boolean;
  mode?: Mode;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({ chunks, sources, isLoading, mode }) => {
  const [expandedSources, setExpandedSources] = useState(false);
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);

  const handleCopyChunk = async (chunk: AnswerChunk, index: number) => {
    await copyToClipboard(chunk.text);
    setCopiedChunk(index);
    setTimeout(() => setCopiedChunk(null), 2000);
  };

  const handleShareAnswer = async () => {
    const answerText = chunks.map(c => c.text).join(' ');
    const sourceText = sources.map(s => `${s.title} (${s.domain})`).join('\n');
    
    await shareContent({
      title: 'Answer from Perlé',
      text: `${answerText}\n\nSources:\n${sourceText}`,
      url: window.location.href
    });
  };

  const handleBookmarkAnswer = () => {
    // Save to localStorage for now
    const bookmarks = JSON.parse(localStorage.getItem('perle-bookmarks') || '[]');
    const bookmark = {
      id: Date.now().toString(),
      chunks,
      sources,
      timestamp: Date.now()
    };
    
    bookmarks.unshift(bookmark);
    localStorage.setItem('perle-bookmarks', JSON.stringify(bookmarks.slice(0, 50)));
    
    // Could show a toast notification here
  };

  if (isLoading) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="sub text-sm" style={{ marginBottom: 10 }}>Answer</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i}>
              <div className="skeleton" style={{ height: 20, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 20, borderRadius: 4, width: '80%' }} />
              <div className="spacer-8" />
              <div className="row" style={{ gap: 8 }}>
                <div className="skeleton" style={{ height: 24, width: 120, borderRadius: 12 }} />
                <div className="skeleton" style={{ height: 24, width: 100, borderRadius: 12 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="sub text-sm" style={{ marginBottom: 10 }}>Answer</div>
        <div className="sub">
          Ask a question to get a sourced, concise answer.
        </div>
        <div className="spacer-14" />
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {[
            'What is machine learning?',
            'How does AI work?',
            'Compare React vs Vue',
            'Explain quantum computing'
          ].map(suggestion => (
            <span key={suggestion} className="chip" role="button" tabIndex={0}>
              {suggestion}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 16 
      }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <div style={{ 
            fontSize: 14, 
            fontWeight: 500,
            color: 'var(--sub)'
          }}>
            Answer
          </div>
          {mode && (
            <span className="chip" style={{ 
              fontSize: 11, 
              padding: '4px 8px',
              background: 'var(--accent)',
              color: '#111',
              fontWeight: 600
            }}>
              {mode}
            </span>
          )}
        </div>
        <div style={{ 
          display: 'flex', 
          gap: 4 
        }}>
          <button
            className="btn-ghost"
            onClick={handleBookmarkAnswer}
            aria-label="Bookmark answer"
            style={{ 
              padding: 8,
              fontSize: 16
            }}
          >
            🔖
          </button>
          <button
            className="btn-ghost"
            onClick={handleShareAnswer}
            aria-label="Share answer"
            style={{ 
              padding: 8,
              fontSize: 16
            }}
          >
            📤
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {chunks.map((chunk, index) => (
          <div key={index} style={{ position: 'relative' }}>
            <div 
              style={{ 
                fontSize: 16, 
                lineHeight: '24px',
                marginBottom: 12,
                color: 'var(--text)'
              }}
            >
              {chunk.text}
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start',
              gap: 12
            }}>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: 6, 
                flex: 1 
              }}>
                {chunk.citationIds.map(id => {
                  const source = sources.find(s => s.id === id);
                  return source ? <SourceChip key={`${id}-${index}`} source={source} /> : null;
                })}
              </div>
              
              <button
                className="btn-ghost"
                onClick={() => handleCopyChunk(chunk, index)}
                aria-label="Copy chunk"
                style={{ 
                  padding: 6,
                  opacity: copiedChunk === index ? 1 : 0.6,
                  flexShrink: 0,
                  alignSelf: 'flex-start'
                }}
              >
                {copiedChunk === index ? '✓' : '📋'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="spacer-16" />
      
      {/* Sources Section */}
      <div>
        <button
          className="btn-ghost"
          onClick={() => setExpandedSources(!expandedSources)}
          style={{ 
            width: '100%', 
            justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: '1px solid var(--border)',
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 500
          }}
        >
          <span>Sources ({sources.length})</span>
          <span style={{ 
            transform: expandedSources ? 'rotate(180deg)' : 'rotate(0deg)', 
            transition: 'transform 0.2s',
            fontSize: 12
          }}>
            ▼
          </span>
        </button>
        
        {expandedSources && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.map(source => (
              <div key={source.id} className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {source.title}
                </div>
                <div className="sub text-sm" style={{ marginBottom: 6 }}>
                  {source.domain} • {source.year}
                </div>
                {source.snippet && (
                  <div className="sub text-sm" style={{ lineHeight: '18px' }}>
                    {source.snippet}
                  </div>
                )}
                <button
                  className="btn-ghost"
                  onClick={() => window.open(source.url, '_blank')}
                  style={{ 
                    marginTop: 8, 
                    padding: '4px 8px',
                    fontSize: 12
                  }}
                >
                  Visit Source →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="spacer-16" />
      
      {/* Follow-up Actions */}
      <div>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 500, 
          marginBottom: 12,
          color: 'var(--text)'
        }}>
          Follow-up Actions
        </div>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 8 
        }}>
          {[
            'Show recent studies only',
            'Compare viewpoints',
            'Summarize in 5 bullets',
            'What are the risks?',
            'Find similar topics',
            'Explain like I\'m 5'
          ].map(action => (
            <span key={action} className="chip" role="button" tabIndex={0}>
              {action}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
