import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaTrash, FaComments, FaTimes, FaThumbtack } from 'react-icons/fa';
import { formatTimestampIST } from '../utils/helpers';
import { getUserData } from '../utils/auth';

interface Conversation {
  id: string;
  title: string;
  chat_mode: string;
  created_at: string;
  updated_at: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
}

interface ConversationSidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isOpen,
  onToggle,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isClosingRef = useRef(false);
  // Pin is a paid feature (Pro 5 / Max 10). Hide the button entirely for free
  // and anonymous users — no point showing UI that always errors out.
  const [canPin, setCanPin] = useState<boolean>(() => Boolean(getUserData()?.isPremium));
  useEffect(() => {
    const refresh = () => setCanPin(Boolean(getUserData()?.isPremium));
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const fetchConversations = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders, getAuthToken } = await import('../utils/auth');

      if (!getAuthToken()) {
        setConversations([]);
        return;
      }
      
      const response = await fetch(`${baseUrl}/api/conversations?chatMode=normal`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      } else if (response.status === 401) {
        setConversations([]);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  // Refresh conversations when active conversation changes
  useEffect(() => {
    const refresh = async () => {
      const { getAuthToken } = await import('../utils/auth');
      if (activeConversationId && getAuthToken()) {
        fetchConversations();
      }
    };
    refresh();
  }, [activeConversationId]);

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation(); // Prevent selecting the conversation

    if (!confirm('Delete this conversation? This cannot be undone.')) {
      return;
    }

    try {
      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders } = await import('../utils/auth');

      const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        onDeleteConversation(conversationId);
        fetchConversations();
      } else {
        alert('Failed to delete conversation');
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation');
    }
  };

  const handleTogglePin = async (
    e: React.MouseEvent,
    conversationId: string,
    currentlyPinned: boolean,
  ) => {
    e.stopPropagation();
    // Optimistic update — flip the bit locally so the chip moves to the top
    // immediately, then revert if the server rejects.
    setConversations((prev) =>
      [...prev]
        .map((c) =>
          c.id === conversationId
            ? { ...c, is_pinned: !currentlyPinned, pinned_at: !currentlyPinned ? new Date().toISOString() : null }
            : c,
        )
        .sort((a, b) => {
          // Pinned first (most-recently pinned first), then by updated_at desc.
          const pa = a.is_pinned ? 1 : 0;
          const pb = b.is_pinned ? 1 : 0;
          if (pa !== pb) return pb - pa;
          if (a.is_pinned && b.is_pinned) {
            return (b.pinned_at || '').localeCompare(a.pinned_at || '');
          }
          return (b.updated_at || '').localeCompare(a.updated_at || '');
        }),
    );
    try {
      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders } = await import('../utils/auth');
      const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !currentlyPinned }),
      });
      if (!response.ok) {
        // Roll back the optimistic update
        fetchConversations();
        // Surface the right message for the two pin-related rejections.
        try {
          const errData = await response.json();
          // 403 = paid-only feature; 409 = at the per-tier cap.
          if ((response.status === 403 || response.status === 409) && errData?.limitReached) {
            alert(errData.error || 'Pin limit reached.');
          }
        } catch { /* ignore parse failure */ }
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      fetchConversations();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return formatTimestampIST(date);
    }
  };


  // click on new chat
  const handleNewChat = () => {
    onNewConversation();
    // Only close sidebar on mobile devices
    if (window.innerWidth < 1024 && isOpen) {
      isClosingRef.current = true;
      onToggle();
      // Reset the flag after a short delay
      setTimeout(() => {
        isClosingRef.current = false;
      }, 300);
    }
  };

  return (
    <>
      {/* Hover trigger on left edge — desktop only */}
      <div
        className="hidden lg:block fixed top-0 left-0 bottom-0 w-2 z-40"
        onMouseEnter={() => !isOpen && onToggle()}
        style={{
          cursor: "pointer",
          backgroundColor: "transparent",
        }}
      />

      {/* Sidebar */}
      <div
        className={`
          fixed lg:absolute top-0 left-0 h-screen
          w-80 bg-gradient-to-b from-[var(--card)] to-[var(--bg)]
          border-r border-[var(--border)] shadow-2xl
          flex flex-col transition-transform duration-300 ease-in-out z-40
          backdrop-blur-sm
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        onMouseLeave={() => {
          // Don't toggle if we're on mobile or if we just clicked a button
          if (window.innerWidth >= 1024 && !isClosingRef.current) {
            onToggle();
          }
        }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--card)] bg-opacity-80 backdrop-blur-sm" style={{ paddingTop: "calc(16px + var(--safe-area-top))" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">Conversations</h2>
            {/* Mobile Close Button */}
            <button
              onClick={onToggle}
              className="lg:hidden p-2 rounded-lg hover:bg-[var(--card)] transition-colors duration-200 text-[var(--sub)] hover:text-[var(--text)]"
              aria-label="Close sidebar"
            >
              <FaTimes size={18} />
            </button>
          </div>
          <button
            onClick={handleNewChat}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
          >
            <FaPlus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-3 bg-[var(--bg)] bg-opacity-30">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-[var(--sub)]">
                <div className="animate-pulse">Loading...</div>
              </div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="p-4 rounded-full bg-[var(--card)] mb-4">
                <FaComments size={32} className="text-[var(--sub)] opacity-50" />
              </div>
              <p className="text-[var(--text)] font-medium">No conversations yet</p>
              <p className="text-sm mt-2 text-[var(--sub)]">Click "New Chat" to start</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                    className={`
                    group relative p-4 rounded-xl cursor-pointer
                    transition-all duration-200 shadow-sm
                    ${
                      activeConversationId === conv.id
                        ? 'bg-[var(--accent)] bg-opacity-15 border-2 border-[var(--accent)] shadow-md'
                        : 'bg-[var(--card)] hover:bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--border)] hover:shadow-md'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`
                          text-sm font-semibold truncate mb-1 flex items-center gap-1
                          ${
                            activeConversationId === conv.id
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--text)]'
                          }
                        `}
                      >
                        {conv.is_pinned && (
                          <FaThumbtack
                            size={10}
                            className="text-[var(--accent)] flex-shrink-0"
                            aria-label="Pinned"
                          />
                        )}
                        <span className="truncate">{conv.title}</span>
                      </h4>
                      <p className="text-xs text-[var(--sub)]">
                        {formatDate(conv.updated_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Pin / unpin — paid feature, hidden for free / anon users.
                          Already-pinned ones always show (so a downgraded user can still unpin). */}
                      {(canPin || conv.is_pinned) && (
                        <button
                          onClick={(e) => handleTogglePin(e, conv.id, !!conv.is_pinned)}
                          className={`
                            p-2 rounded-lg
                            transition-all duration-200
                            ${conv.is_pinned
                              ? 'text-[var(--accent)] opacity-100 hover:bg-[var(--accent)] hover:bg-opacity-15'
                              : 'opacity-60 hover:opacity-100 text-[var(--sub)] hover:text-[var(--accent)] hover:bg-[var(--accent)] hover:bg-opacity-10'}
                          `}
                          aria-label={conv.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
                          title={conv.is_pinned ? 'Unpin' : 'Pin to top'}
                        >
                          <FaThumbtack size={14} />
                        </button>
                      )}

                      {/* Delete — always visible (tappable on mobile, no hover there) */}
                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="
                          opacity-60 hover:opacity-100
                          p-2 rounded-lg hover:bg-red-500 hover:bg-opacity-20
                          transition-all duration-200
                          text-[var(--sub)] hover:text-red-500
                        "
                        aria-label="Delete conversation"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--card)] bg-opacity-80 backdrop-blur-sm">
          <p className="text-xs text-[var(--sub)] font-medium">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="lg:hidden fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-30 transition-opacity duration-300"
        />
      )}
    </>
  );
};
