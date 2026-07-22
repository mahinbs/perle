import { useState } from 'react';
import { FaFlag } from 'react-icons/fa';
import { ReportAIResponseModal } from './ReportAIResponseModal';

interface ReportAIResponseButtonProps {
  aiResponse: string;
  userPrompt?: string;
  conversationId?: string;
  messageId?: string;
  modelUsed?: string;
  chatMode?: string;
  /**
   * compact = icon + "Report" (toolbar)
   * full = larger labeled control (message footer)
   */
  variant?: 'compact' | 'full';
  className?: string;
  style?: React.CSSProperties;
}

/** In-app report control required by Google Play AI-Generated Content policy. */
export function ReportAIResponseButton({
  aiResponse,
  userPrompt,
  conversationId,
  messageId,
  modelUsed,
  chatMode,
  variant = 'compact',
  className,
  style,
}: ReportAIResponseButtonProps) {
  const [open, setOpen] = useState(false);
  const disabled = !aiResponse?.trim();
  const isFull = variant === 'full';

  return (
    <>
      <button
        type="button"
        className={className || 'btn-ghost glass-button'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={disabled}
        aria-label="Report AI response"
        title="Report inappropriate or harmful AI content"
        style={{
          minHeight: 44,
          minWidth: isFull ? undefined : 44,
          padding: isFull ? '8px 14px' : '8px 10px',
          fontSize: isFull ? 'var(--font-sm)' : 'var(--font-xs)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderRadius: 999,
          opacity: disabled ? 0.4 : 1,
          touchAction: 'manipulation',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
      >
        <FaFlag size={isFull ? 14 : 13} aria-hidden />
        <span style={{ fontWeight: 600 }}>Report</span>
      </button>
      <ReportAIResponseModal
        open={open}
        onClose={() => setOpen(false)}
        aiResponse={aiResponse}
        userPrompt={userPrompt}
        conversationId={conversationId}
        messageId={messageId}
        modelUsed={modelUsed}
        chatMode={chatMode}
      />
    </>
  );
}
