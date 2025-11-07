import React from 'react';
import type { DiscoverItem } from '../types';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { getAllDiscoverItems } from '../services/discoverService';

// Get discover items from service
const discoverItems = getAllDiscoverItems();

export const DiscoverRail: React.FC = () => {
  const { navigateTo } = useRouterNavigation();

  const handleItemClick = (item: DiscoverItem) => {
    // Navigate to details page with specific item data
    navigateTo(`/details/${item.id}`, { item });
  };

  const handleViewAll = () => {
    navigateTo('/discover');
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="h3">Discover</div>
        <button 
          className="btn-ghost" 
          onClick={handleViewAll}
          style={{ fontSize: 'var(--font-md)' }}
        >
          View All →
        </button>
      </div>
      
      <div className="scroll-x">
        {discoverItems.map(item => (
          <div 
            key={item.id} 
            className="card" 
            style={{ 
              padding: 0, 
              minWidth: 240, 
              maxWidth: 280,
              overflow: 'hidden',
              cursor: 'pointer'
            }}
            onClick={() => handleItemClick(item)}
          >
            <img 
              src={item.image} 
              alt={item.alt} 
              style={{ 
                display: 'block', 
                width: '100%', 
                height: 140, 
                objectFit: 'cover' 
              }} 
            />
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {item.title}
              </div>
              <div className="sub text-sm" style={{ marginBottom: 8, lineHeight: '18px' }}>
                {item.description}
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="chip" style={{ fontSize: 'var(--font-sm)' }}>
                  {item.tag}
                </span>
                <span className="sub text-sm">
                  {item.category}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};