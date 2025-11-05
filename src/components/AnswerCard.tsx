import React, { useState, useRef, useEffect } from 'react';
import type { AnswerChunk, Source, Mode } from '../types';
import { SourceChip } from './SourceChip';
import { copyToClipboard, shareContent } from '../utils/helpers';
import { useToast } from '../contexts/ToastContext';
import { FaVolumeUp, FaStop, FaBookmark, FaShare, FaClipboard, FaCheck, FaChevronDown } from 'react-icons/fa';

interface AnswerCardProps {
  chunks: AnswerChunk[];
  sources: Source[];
  isLoading: boolean;
  mode?: Mode;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({ chunks, sources, isLoading, mode }) => {
  const [expandedSources, setExpandedSources] = useState(false);
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const { showToast } = useToast();

  // Check for speech synthesis support
  useEffect(() => {
    setSpeechSupported('speechSynthesis' in window);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (synthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Auto-speak the next answer when triggered from voice overlay
  useEffect(() => {
    const shouldSpeak = localStorage.getItem('perle-speak-next-answer');
    if (!shouldSpeak) return;
    if (chunks.length === 0 || isLoading) return;
    // consume the flag
    localStorage.removeItem('perle-speak-next-answer');
    startVoiceOutput();
  }, [chunks, isLoading]);

  const handleCopyChunk = async (chunk: AnswerChunk, index: number) => {
    try {
      await copyToClipboard(chunk.text);
      setCopiedChunk(index);
      setTimeout(() => setCopiedChunk(null), 2000);
      showToast({
        message: 'Copied to clipboard!',
        type: 'success',
        duration: 2000
      });
    } catch (error) {
      showToast({
        message: 'Failed to copy',
        type: 'error',
        duration: 2000
      });
    }
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
    
    showToast({
      message: 'Answer bookmarked!',
      type: 'success',
      duration: 2000
    });
  };

  const startVoiceOutput = () => {
    if (!speechSupported) {
      alert('Voice output is not supported in this browser');
      return;
    }

    if (isSpeaking) {
      stopVoiceOutput();
      return;
    }

    // Stop any existing speech
    window.speechSynthesis.cancel();

    const answerText = chunks.map(c => c.text).join(' ');
    
    // Split text into words for progressive display (preserve spaces)
    const words = answerText.split(/(\s+)/).filter(w => w.length > 0);
    let currentWordIndex = 0;
    let speechStartTime = 0;
    let fallbackInterval: number | null = null;
    let lastBoundaryUpdate = 0;
    
    // Initialize with empty text
    localStorage.setItem('perle-current-answer-text', '');
    localStorage.setItem('perle-current-word-index', '0');
    localStorage.setItem('perle-speech-rate', '0.9');
    
    const utterance = new SpeechSynthesisUtterance(answerText);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;

    utterance.onstart = () => {
      setIsSpeaking(true);
      currentWordIndex = 0;
      speechStartTime = Date.now();
      lastBoundaryUpdate = Date.now();
      
      // Show first word immediately
      if (words.length > 0) {
        const displayedText = words[0];
        localStorage.setItem('perle-current-answer-text', displayedText);
        localStorage.setItem('perle-current-word-index', '0');
      }
      
      // Fallback timer for mobile devices where onboundary may not fire reliably
      // Estimate words per second: average English is ~150 words/min = 2.5 words/sec
      // With rate 0.9, that's ~2.25 words/sec, so ~444ms per word
      const estimatedMsPerWord = 450 / utterance.rate;
      
      fallbackInterval = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
          return;
        }
        
        const elapsed = Date.now() - speechStartTime;
        const timeSinceLastUpdate = Date.now() - lastBoundaryUpdate;
        
        // Calculate estimated progress based on elapsed time
        const estimatedWordIndex = Math.min(
          Math.floor((elapsed / estimatedMsPerWord) + 1),
          words.length - 1
        );
        
        // Use fallback if onboundary hasn't updated recently (mobile fallback)
        // This ensures mobile devices get updates even if boundary events are delayed or missing
        const shouldUseFallback = timeSinceLastUpdate > estimatedMsPerWord * 0.8;
        
        // Always update if we've progressed and either:
        // 1. Boundary events haven't updated recently (fallback mode), OR
        // 2. We're significantly ahead of the last boundary update (catch-up mode)
        if (estimatedWordIndex > currentWordIndex && shouldUseFallback) {
          currentWordIndex = estimatedWordIndex;
          const displayedText = words.slice(0, estimatedWordIndex + 1).join('');
          localStorage.setItem('perle-current-answer-text', displayedText);
          localStorage.setItem('perle-current-word-index', estimatedWordIndex.toString());
          // Update lastBoundaryUpdate to prevent double-updates when boundary catches up
          lastBoundaryUpdate = Date.now();
        }
      }, 150); // Check every 150ms for smoother updates
    };

    // Track word boundaries for progressive text display
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === 'word' && event.charIndex !== undefined) {
        // Calculate which word we're currently on based on character index
        let charCount = 0;
        let wordIndex = 0;
        
        for (let i = 0; i < words.length; i++) {
          const wordLength = words[i].length;
          if (charCount + wordLength > event.charIndex) {
            wordIndex = i;
            break;
          }
          charCount += wordLength;
        }
        
        // Update if we've moved to a new word
        if (wordIndex > currentWordIndex) {
          currentWordIndex = wordIndex;
          lastBoundaryUpdate = Date.now();
          // Update displayed text up to and including current word
          const displayedText = words.slice(0, wordIndex + 1).join('');
          localStorage.setItem('perle-current-answer-text', displayedText);
          localStorage.setItem('perle-current-word-index', wordIndex.toString());
        }
      }
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      // Clear fallback interval
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      // Show full text when speech ends
      localStorage.setItem('perle-current-answer-text', answerText);
      // Clear the stored text after a delay
      setTimeout(() => {
        localStorage.removeItem('perle-current-answer-text');
        localStorage.removeItem('perle-current-word-index');
      }, 2000);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      setIsSpeaking(false);
      // Clear fallback interval
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      // Show full text on error
      localStorage.setItem('perle-current-answer-text', answerText);
    };

    synthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopVoiceOutput = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    // Clear the stored text when speech is stopped
    localStorage.removeItem('perle-current-answer-text');
    localStorage.removeItem('perle-current-word-index');
    // Note: fallbackInterval will be cleared in onend/onerror handlers
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
          {speechSupported && (
            <>
              <button
                className="btn-ghost"
                onClick={startVoiceOutput}
                aria-label={isSpeaking ? "Stop speaking" : "Speak answer"}
                style={{ 
                  padding: 8,
                  fontSize: 16,
                  background: isSpeaking ? 'var(--accent)' : 'transparent',
                  color: isSpeaking ? 'white' : 'inherit'
                }}
              >
                <FaVolumeUp size={18} />
              </button>
              {isSpeaking && (
                <button
                  className="btn-ghost"
                  onClick={stopVoiceOutput}
                  aria-label="Stop speaking"
                  style={{ 
                    padding: 8,
                    fontSize: 16,
                    color: 'var(--accent)'
                  }}
                >
                  <FaStop size={18} />
                </button>
              )}
            </>
          )}
          <button
            className="btn-ghost"
            onClick={handleBookmarkAnswer}
            aria-label="Bookmark answer"
            style={{ 
              padding: 8,
              fontSize: 16
            }}
          >
            <FaBookmark size={18} />
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
            <FaShare size={18} />
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
                {copiedChunk === index ? <FaCheck size={16} /> : <FaClipboard size={16} />}
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
            <FaChevronDown size={14} />
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
