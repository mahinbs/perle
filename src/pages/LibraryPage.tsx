import { useState, useEffect } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { getAuthHeaders, isAuthenticated } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

interface LibraryItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url?: string;
  date: string;
  isBookmarked: boolean;
  tags: string[];
}

export default function LibraryPage() {
  const { navigateTo } = useRouterNavigation();
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');

  // Fetch library items from backend
  useEffect(() => {
    const fetchLibraryItems = async () => {
      if (!API_URL || !isAuthenticated()) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`${API_URL}/api/library`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const items = await response.json();
          setLibraryItems(items);
        } else if (response.status === 401) {
          // Not authenticated, show empty state
          setLibraryItems([]);
        }
      } catch (error) {
        console.error('Failed to fetch library items:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLibraryItems();
  }, []);

  const allTags = ['All', ...Array.from(new Set(libraryItems.flatMap(item => item.tags)))];
  const bookmarkedItems = libraryItems.filter(item => item.isBookmarked);

  const filteredItems = libraryItems.filter(item => {
    const matchesSearch = searchQuery === '' || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag === 'All' || item.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    } else {
      return a.title.localeCompare(b.title);
    }
  });

  const toggleBookmark = async (id: string) => {
    if (!API_URL || !isAuthenticated()) return;

    const item = libraryItems.find(i => i.id === id);
    if (!item) return;

    try {
      const response = await fetch(`${API_URL}/api/library/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isBookmarked: !item.isBookmarked }),
      });

      if (response.ok) {
        const updated = await response.json();
        setLibraryItems(prev => 
          prev.map(i => i.id === id ? updated : i)
        );
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return;
    }

    if (!API_URL || !isAuthenticated()) {
      setLibraryItems(prev => prev.filter(item => item.id !== id));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/library/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response.ok || response.status === 204) {
        setLibraryItems(prev => prev.filter(item => item.id !== id));
      } else {
        alert('Failed to delete item. Please try again.');
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleItemClick = (item: LibraryItem) => {
    if (item.url) {
      window.open(item.url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="h1">Library</div>
          <button 
            className="btn-ghost" 
            onClick={() => navigateTo('/profile')}
            style={{ fontSize: "var(--font-md)" }}
          >
            ← Back
          </button>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="sub">Loading library...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return (
      <div className="container">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="h1">Library</div>
          <button 
            className="btn-ghost" 
            onClick={() => navigateTo('/profile')}
            style={{ fontSize: "var(--font-md)" }}
          >
            ← Back
          </button>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="h3" style={{ marginBottom: 8 }}>Sign in required</div>
          <div className="sub" style={{ marginBottom: 20 }}>
            Please sign in to view your library
          </div>
          <button 
            className="btn" 
            onClick={() => navigateTo('/profile')}
          >
            Go to Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="h1">Library</div>
        <button 
          className="btn-ghost" 
          onClick={() => navigateTo('/profile')}
          style={{ fontSize: "var(--font-md)" }}
        >
          ← Back
        </button>
      </div>

      {/* Stats */}
      <div className="row" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 120, marginRight: 12, marginBottom: 8 }}>
          <div className="h3" style={{ marginBottom: 4 }}>{libraryItems.length}</div>
          <div className="sub text-sm">Total Items</div>
        </div>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 120, marginRight: 12, marginBottom: 8 }}>
          <div className="h3" style={{ marginBottom: 4 }}>{bookmarkedItems.length}</div>
          <div className="sub text-sm">Bookmarked</div>
        </div>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 120, marginBottom: 8 }}>
          <div className="h3" style={{ marginBottom: 4 }}>{allTags.length - 1}</div>
          <div className="sub text-sm">Tags</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <input
          className="input"
          placeholder="Search your library..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ fontSize: "var(--font-md)", marginBottom: 12 }}
        />
        
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {/* Tag Filter */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {allTags.slice(0, 5).map(tag => (
              <button
                key={tag}
                className={`chip ${tag === selectedTag ? 'active' : ''}`}
                onClick={() => setSelectedTag(tag)}
                style={{ 
                  background: tag === selectedTag ? 'var(--accent)' : 'var(--card)',
                  color: tag === selectedTag ? '#111' : 'var(--sub)'
                }}
              >
                {tag}
              </button>
            ))}
            {allTags.length > 5 && (
              <span className="sub text-sm" style={{ alignSelf: 'center' }}>
                +{allTags.length - 5} more
              </span>
            )}
          </div>

          {/* Sort Options */}
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <span className="sub text-sm" style={{ alignSelf: 'center' }}>Sort by:</span>
            <button
              className={`pill ${sortBy === 'date' ? 'active' : ''}`}
              onClick={() => setSortBy('date')}
              style={{ fontSize: "var(--font-sm)", padding: '6px 12px' }}
            >
              Date
            </button>
            <button
              className={`pill ${sortBy === 'title' ? 'active' : ''}`}
              onClick={() => setSortBy('title')}
              style={{ fontSize: "var(--font-sm)", padding: '6px 12px' }}
            >
              Title
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="sub text-sm" style={{ marginBottom: 16 }}>
        {sortedItems.length} {sortedItems.length === 1 ? 'item' : 'items'} found
      </div>

      {/* Library Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sortedItems.map(item => (
          <div key={item.id} className="card" style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div 
                style={{ flex: 1, cursor: item.url ? 'pointer' : 'default' }}
                onClick={() => handleItemClick(item)}
              >
                <div className="h3" style={{ marginBottom: 4, lineHeight: 1.3 }}>
                  {item.title}
                </div>
                <div className="sub text-sm" style={{ marginBottom: 8, lineHeight: 1.4 }}>
                  {item.content.length > 120 ? `${item.content.substring(0, 120)}...` : item.content}
                </div>
                <div className="row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="sub text-sm">{item.source}</span>
                  <span className="sub text-sm">•</span>
                  <span className="sub text-sm">{new Date(item.date).toLocaleDateString()}</span>
                  {item.url && (
                    <>
                      <span className="sub text-sm">•</span>
                      <span className="sub text-sm" style={{ color: 'var(--accent)' }}>View Source</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                <button
                  className="btn-ghost"
                  onClick={() => toggleBookmark(item.id)}
                  style={{ padding: 8 }}
                  aria-label={item.isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                >
                  {item.isBookmarked ? '🔖' : '📖'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => deleteItem(item.id)}
                  style={{ padding: 8, color: '#ff4444' }}
                  aria-label="Delete item"
                >
                  🗑️
                </button>
              </div>
            </div>
            
            {/* Tags */}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {item.tags.map(tag => (
                <span key={tag} className="chip" style={{ fontSize: "var(--font-sm)" }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sortedItems.length === 0 && !isLoading && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="h3" style={{ marginBottom: 8 }}>No items found</div>
          <div className="sub">Try adjusting your search or filters</div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="spacer-16" />
      <div className="card" style={{ padding: 16 }}>
        <div className="h3" style={{ marginBottom: 12 }}>Quick Actions</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {[
            'Export library',
            'Import from file',
            'Sync with account',
            'Clear old items'
          ].map(action => (
            <button 
              key={action} 
              className="btn-ghost" 
              style={{ fontSize: "var(--font-sm)", padding: '8px 12px' }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      <div className="spacer-40" />
    </div>
  );
}
