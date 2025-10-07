import React from 'react';
import { useMobile } from '../hooks/useMobile';

export const OfflineIndicator: React.FC = () => {
  const { isOnline } = useMobile();

  if (isOnline) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: '#FF6B6B',
        color: 'white',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: '500',
        zIndex: 1000,
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      📡 You're offline. Some features may be limited.
    </div>
  );
};
