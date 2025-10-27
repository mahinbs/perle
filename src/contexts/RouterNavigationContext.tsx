import { createContext, useContext, ReactNode } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

interface RouterNavigationContextType {
  navigateTo: (path: string, state?: any) => void;
  goBack: () => void;
  currentPath: string;
  params: any;
  state: any;
}

const RouterNavigationContext = createContext<RouterNavigationContextType | undefined>(undefined);

export const useRouterNavigation = () => {
  const context = useContext(RouterNavigationContext);
  if (!context) {
    throw new Error('useRouterNavigation must be used within a RouterNavigationProvider');
  }
  return context;
};

interface RouterNavigationProviderProps {
  children: ReactNode;
}

export const RouterNavigationProvider: React.FC<RouterNavigationProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const navigateTo = (path: string, state?: any) => {
    navigate(path, { state });
  };

  const goBack = () => {
    navigate(-1);
  };

  return (
    <RouterNavigationContext.Provider 
      value={{ 
        navigateTo, 
        goBack, 
        currentPath: location.pathname, 
        params, 
        state: location.state 
      }}
    >
      {children}
    </RouterNavigationContext.Provider>
  );
};
