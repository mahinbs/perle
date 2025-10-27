import React from 'react';
import { Dot } from './Dot';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const { navigateTo } = useRouterNavigation();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <div 
          className="h1" 
          style={{ cursor: 'pointer' }}
          onClick={() => navigateTo('/')}
        >
          Perlé <Dot />
        </div>
      </div>
      
      <div className="row" style={{ gap: 8 }}>
        <button 
          className={`btn-ghost ${isActive('/discover') ? 'active' : ''}`}
          onClick={() => navigateTo('/discover')}
          aria-label="Discover"
        >
          Discover
        </button>
        <button 
          className={`btn-ghost ${isActive('/library') ? 'active' : ''}`}
          onClick={() => navigateTo('/library')}
          aria-label="Library"
        >
          Library
        </button>
        <button 
          className={`btn-ghost ${isActive('/profile') ? 'active' : ''}`}
          onClick={() => navigateTo('/profile')}
          aria-label="Profile"
        >
          Profile
        </button>
      </div>
    </header>
  );
};
