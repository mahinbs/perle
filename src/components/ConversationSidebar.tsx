import { useState, useEffect } from 'react';
import { FaPlus, FaTrash, FaComments } from 'react-icons/fa';
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

  return (
    <>
      {/* Desktop Hover Button - Always Visible */}
      <div
        className="hidden lg:block fixed top-20 left-0 z-50 group"
        onMouseEnter={() => onToggle()}
      >
        <button
          className="p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-r-lg shadow-lg hover:bg-[var(--bg-tertiary)]"
          aria-label="Show conversations"
        >
          <FaComments size={20} />
        </button>
      </div>

      {/* Mobile Toggle Button */}
      <button
        onClick={onToggle}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg shadow-lg"
        aria-label="Toggle conversations"
      >
        <FaComments size={20} />
      </button>

      {/* Sidebar */}
      <div
        className={`
          fixed lg:absolute top-0 left-0 h-screen
          w-80 bg-[var(--card-bg)] border-r border-[var(--border)]
          flex flex-col transition-transform duration-300 ease-in-out z-40
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        onMouseLeave={() => onToggle()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)]">
          <button
            onClick={onNewConversation}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3"
          >
            <FaPlus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-[var(--text-secondary)]">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-[var(--text-secondary)]">
              <FaComments size={48} className="mb-4 opacity-30" />
              <p>No conversations yet</p>
              <p className="text-sm mt-2">Click "New Chat" to start</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`
                    group relative p-3 rounded-lg cursor-pointer
                    transition-all duration-200
                    ${
                      activeConversationId === conv.id
                        ? 'bg-[var(--primary)] bg-opacity-10 border border-[var(--primary)]'
                        : 'hover:bg-[var(--bg-tertiary)] border border-transparent'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`
                          text-sm font-medium truncate
                          ${
                            activeConversationId === conv.id
                              ? 'text-[var(--primary)]'
                              : 'text-[var(--text-primary)]'
                          }
                        `}
                      >
                        {conv.title}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {formatDate(conv.updated_at)}
                      </p>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="
                        opacity-0 group-hover:opacity-100
                        p-2 rounded hover:bg-red-500 hover:bg-opacity-20
                        transition-opacity duration-200
                        text-[var(--text-secondary)] hover:text-red-500
                      "
                      aria-label="Delete conversation"
                    >
                      <FaTrash size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
          <p>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
        />
      )}
    </>
  );
};
