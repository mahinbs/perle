import React, { useState, useEffect } from 'react';
import type { DiscoverItem, Mode } from '../types';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { getAllDiscoverItems } from '../services/discoverService';

export const DiscoverRail: React.FC = () => {
  const { navigateTo } = useRouterNavigation();
  const [discoverItems, setDiscoverItems] = useState<DiscoverItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const items = await getAllDiscoverItems();
        setDiscoverItems(Array.isArray(items) ? items.slice(0, 2) : []);
      } catch (error) {
        console.error('Failed to fetch discover items:', error);
        setDiscoverItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchItems();
  }, []);

  const getModeFromTag = (tag: string): Mode => {
    const tagLower = tag.toLowerCase();
    if (tagLower.includes('research')) return 'Research';
    if (tagLower.includes('explain') || tagLower.includes('brief')) return 'Ask';
    if (tagLower.includes('compare')) return 'Compare';
    if (tagLower.includes('summarize') || tagLower.includes('summary')) return 'Summarize';
    return 'Ask';
  };

  const handleItemClick = (item: DiscoverItem) => {
    const mode = getModeFromTag(item.tag);
    navigateTo('/', {
      searchQuery: item.title,
      mode: mode,
    });
  };

  if (isLoading) {
    return (
      <div className="px-1 mb-3">
        <div className="sub text-sm">Loading discover...</div>
      </div>
    );
  }

  if (!discoverItems || discoverItems.length === 0) {
    return null;
  }

  return (
    <div className="px-1 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="h3 text-base font-semibold">Discover</div>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => navigateTo('/discover')}
        >
          View All →
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {discoverItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleItemClick(item)}
            className="glass-card border border-[var(--border)] rounded-xl overflow-hidden flex flex-row items-stretch text-left w-full hover:border-[var(--accent)] transition-colors"
            style={{ minHeight: 88 }}
          >
            <img
              src={item.image}
              alt={item.alt}
              className="w-[100px] min-w-[100px] h-[88px] object-cover shrink-0"
            />
            <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
              <div className="font-semibold text-sm mb-1 truncate">{item.title}</div>
              <div className="sub text-xs line-clamp-2 leading-snug opacity-80">
                {item.description}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="chip text-xs py-0.5 px-2">{item.tag}</span>
                <span className="sub text-xs opacity-60">{item.category}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
