import { useState } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';

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

const defaultLibraryItems: LibraryItem[] = [
  {
    id: '1',
    title: 'The Future of AI in Healthcare',
    content: 'Artificial intelligence is revolutionizing medical diagnosis and treatment...',
    source: 'Nature Medicine',
    url: 'https://example.com/ai-healthcare',
    date: '2024-01-15',
    isBookmarked: true,
    tags: ['AI', 'Healthcare', 'Technology']
  },
  {
    id: '2',
    title: 'Climate Change Solutions',
    content: 'Innovative approaches to combating climate change and environmental degradation...',
    source: 'Scientific American',
    url: 'https://example.com/climate-solutions',
    date: '2024-01-10',
    isBookmarked: false,
    tags: ['Environment', 'Climate', 'Science']
  },
  {
    id: '3',
    title: 'Quantum Computing Breakthroughs',
    content: 'Recent advances in quantum computing are opening new possibilities...',
    source: 'MIT Technology Review',
    url: 'https://example.com/quantum-computing',
    date: '2024-01-08',
    isBookmarked: true,
    tags: ['Quantum', 'Computing', 'Physics']
  }
];

export default function LibraryPage() {
  const { navigateTo } = useRouterNavigation();
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>(defaultLibraryItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');

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

  const toggleBookmark = (id: string) => {
    setLibraryItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, isBookmarked: !item.isBookmarked } : item
      )
    );
  };

  const deleteItem = (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      setLibraryItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleItemClick = (item: LibraryItem) => {
    if (item.url) {
      window.open(item.url, '_blank');
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="h1">Library</div>
        <button 
          className="btn-ghost" 
          onClick={() => navigateTo('/')}
          style={{ fontSize: 14 }}
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
          style={{ fontSize: 16, marginBottom: 12 }}
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
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              Date
            </button>
            <button
              className={`pill ${sortBy === 'title' ? 'active' : ''}`}
              onClick={() => setSortBy('title')}
              style={{ fontSize: 12, padding: '6px 12px' }}
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
                <span key={tag} className="chip" style={{ fontSize: 11 }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sortedItems.length === 0 && (
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
              style={{ fontSize: 12, padding: '8px 12px' }}
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
