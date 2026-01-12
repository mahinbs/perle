import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaTrash, FaComments, FaTimes } from 'react-icons/fa';
import { formatTimestampIST } from '../utils/helpers';

interface Conversation {
  id: string;
  title: string;
  chat_mode: string;
  created_at: string;
  updated_at: string;
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
  onToggle
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isClosingRef = useRef(false);

  const fetchConversations = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders } = await import('../utils/auth');
      
      const response = await fetch(`${baseUrl}/api/conversations?chatMode=normal`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
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
    if (activeConversationId) {
      fetchConversations();
    }
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
      {/* Desktop Hover Button - Always Visible */}
      <div
        className="hidden lg:block fixed top-20 left-0 z-50 group"
        onMouseEnter={() => onToggle()}
      >
        <button
          className="p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-r-lg shadow-lg hover:bg-[var(--bg-tertiary)] transition-colors duration-200 backdrop-blur-sm cursor-pointer"
          aria-label="Show conversations"
        >
          <FaComments size={20} className="text-[var(--text-primary)]" />
        </button>
      </div>

      {/* Mobile Toggle Button */}
      <button
        onClick={onToggle}
        className="lg:hidden fixed top-20 left-4 z-50 p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg shadow-lg hover:bg-[var(--bg-tertiary)] transition-colors duration-200 backdrop-blur-sm"
        aria-label="Toggle conversations"
      >
        <FaComments size={20} className="text-[var(--text-primary)]" />
      </button>

      {/* Sidebar */}
      <div
        className={`
          fixed lg:absolute top-0 left-0 h-screen
          w-80 bg-gradient-to-b from-[var(--card-bg)] to-[var(--bg-secondary)]
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
        <div className="p-4 border-b border-[var(--border)] bg-[var(--card-bg)] bg-opacity-80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Conversations</h2>
            {/* Mobile Close Button */}
            <button
              onClick={onToggle}
              className="lg:hidden p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors duration-200 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
        <div className="flex-1 overflow-y-auto p-3 bg-[var(--bg-secondary)] bg-opacity-30">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-[var(--text-secondary)]">
                <div className="animate-pulse">Loading...</div>
              </div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="p-4 rounded-full bg-[var(--bg-tertiary)] mb-4">
                <FaComments size={32} className="text-[var(--text-secondary)] opacity-50" />
              </div>
              <p className="text-[var(--text-primary)] font-medium">No conversations yet</p>
              <p className="text-sm mt-2 text-[var(--text-secondary)]">Click "New Chat" to start</p>
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
                        ? 'bg-[var(--primary)] bg-opacity-15 border-2 border-[var(--primary)] shadow-md'
                        : 'bg-[var(--card-bg)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--border)] hover:shadow-md'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`
                          text-sm font-semibold truncate mb-1
                          ${
                            activeConversationId === conv.id
                              ? 'text-[var(--primary)]'
                              : 'text-[var(--text-primary)]'
                          }
                        `}
                      >
                        {conv.title}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {formatDate(conv.updated_at)}
                      </p>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="
                        opacity-0 group-hover:opacity-100
                        p-2 rounded-lg hover:bg-red-500 hover:bg-opacity-20
                        transition-all duration-200
                        text-[var(--text-secondary)] hover:text-red-500
                        flex-shrink-0
                      "
                      aria-label="Delete conversation"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--card-bg)] bg-opacity-80 backdrop-blur-sm">
          <p className="text-xs text-[var(--text-secondary)] font-medium">
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
