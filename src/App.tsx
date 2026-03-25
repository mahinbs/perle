import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { RouterNavigationProvider } from './contexts/RouterNavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppRouter } from './components/Router';
import { SplashScreen } from './components/SplashScreen';
import { getUserData } from './utils/auth';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Check initial dark mode state
    const userData = getUserData();
    if (userData && typeof userData.darkMode === 'boolean') {
      if (userData.darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      // Default to dark mode if no user data
      document.documentElement.classList.add('dark');
    }

    const timer = window.setTimeout(() => setShowSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BrowserRouter>
      <RouterNavigationProvider>
        <ToastProvider>
          {showSplash ? <SplashScreen /> : <AppRouter />}
        </ToastProvider>
      </RouterNavigationProvider>
    </BrowserRouter>
  );
}
