import React, { useState, useEffect } from 'react';
import type { LibraryItem } from '../types';

const defaultLibraryItems: LibraryItem[] = [
  {
    id: 'semiconductor-cycle',
    title: 'Semiconductor cycle outlook',
    description: 'Macro signals, foundry capacity, and inventory drawdowns.',
    timestamp: Date.now() - 86400000, // 1 day ago
    tags: ['Technology', 'Economics', 'Analysis'],
    isBookmarked: true
  },
  {
    id: 'eu-ai-act',
    title: 'EU AI Act — key provisions',
    description: 'Risk tiers, obligations, and enforcement timelines.',
    timestamp: Date.now() - 172800000, // 2 days ago
    tags: ['Regulation', 'AI', 'Europe'],
    isBookmarked: true
  },
  {
    id: 'climate-tech',
    title: 'Climate tech investment trends',
    description: 'VC funding patterns and emerging technologies in climate solutions.',
    timestamp: Date.now() - 259200000, // 3 days ago
    tags: ['Climate', 'Investment', 'Technology'],
    isBookmarked: false
  },
  {
    id: 'remote-work',
    title: 'Remote work productivity studies',
    description: 'Latest research on distributed teams and hybrid work models.',
    timestamp: Date.now() - 345600000, // 4 days ago
    tags: ['Work', 'Productivity', 'Research'],
    isBookmarked: false
  }
];

export const Library: React.FC = () => {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>(defaultLibraryItems);
  const [filter, setFilter] = useState<'all' | 'bookmarked'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load saved bookmarks from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('perle-bookmarks');
    if (saved) {
      try {
        const bookmarks = JSON.parse(saved);
        // Convert bookmarks to library items
        const bookmarkItems: LibraryItem[] = bookmarks.map((bookmark: any, index: number) => ({
          id: `bookmark-${bookmark.id}`,
          title: `Bookmarked Answer ${index + 1}`,
          description: bookmark.chunks?.[0]?.text?.substring(0, 100) + '...' || 'Saved answer',
          timestamp: bookmark.timestamp,
          tags: ['Bookmarked'],
          isBookmarked: true
        }));
        
        setLibraryItems(prev => [...bookmarkItems, ...prev]);
      } catch (e) {
        console.warn('Failed to load bookmarks:', e);
      }
    }
  }, []);

  const filteredItems = libraryItems.filter(item => {
    const matchesFilter = filter === 'all' || (filter === 'bookmarked' && item.isBookmarked);
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesFilter && matchesSearch;
  });

  const handleBookmarkToggle = (itemId: string) => {
    setLibraryItems(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, isBookmarked: !item.isBookmarked }
          : item
      )
    );
  };

  const handleItemClick = (item: LibraryItem) => {
    // In a real app, this would open the saved content
    console.log('Clicked library item:', item.title);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="h3">Library</div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className={`btn-ghost ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={{ fontSize: 'var(--font-md)' }}
          >
            All
          </button>
          <button
            className={`btn-ghost ${filter === 'bookmarked' ? 'active' : ''}`}
            onClick={() => setFilter('bookmarked')}
            style={{ fontSize: 'var(--font-md)' }}
          >
            Bookmarked
          </button>
        </div>
      </div>

      {/* Search Library */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Search your library..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ fontSize: 'var(--font-md)' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredItems.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div className="sub">
              {searchQuery 
                ? `No items found for "${searchQuery}"`
                : filter === 'bookmarked' 
                  ? 'No bookmarked items yet'
                  : 'Your library is empty'
              }
            </div>
          </div>
        ) : (
          filteredItems.map(item => (
            <div 
              key={item.id} 
              className="card" 
              style={{ 
                padding: 16,
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={() => handleItemClick(item)}
            >
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {item.title}
                  </div>
                  <div className="sub text-sm" style={{ marginBottom: 8, lineHeight: '18px' }}>
                    {item.description}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {item.tags.map(tag => (
                    <span key={tag} className="chip" style={{ fontSize: 'var(--font-sm)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                
                <button
                  className="btn-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBookmarkToggle(item.id);
                  }}
                  aria-label={item.isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                  style={{ 
                    padding: 8,
                    fontSize: 'var(--font-lg)',
                    color: item.isBookmarked ? 'var(--accent)' : 'var(--sub)'
                  }}
                >
                  {item.isBookmarked ? '🔖' : '🔖'}
                </button>
              </div>
              
              <div className="sub text-sm" style={{ marginTop: 8, opacity: 0.7 }}>
                {new Date(item.timestamp).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Actions */}
      <div className="spacer-16" />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {[
          'Export library',
          'Import from file',
          'Sync with account',
          'Clear old items'
        ].map(action => (
          <span key={action} className="chip" role="button" tabIndex={0}>
            {action}
          </span>
        ))}
      </div>
    </div>
  );
};
