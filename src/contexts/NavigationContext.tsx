import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Page = 'home' | 'discover' | 'profile' | 'library' | 'details';

interface NavigationData {
  item?: any;
  searchQuery?: string;
  [key: string]: any;
}

interface NavigationContextType {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  navigateTo: (page: Page, data?: NavigationData) => void;
  currentData: NavigationData | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [currentData, setCurrentData] = useState<NavigationData | null>(null);

  const navigateTo = (page: Page, data?: NavigationData) => {
    setCurrentPage(page);
    setCurrentData(data || null);
  };

  return (
    <NavigationContext.Provider value={{ currentPage, setCurrentPage, navigateTo, currentData }}>
      {children}
    </NavigationContext.Provider>
  );
};
