import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { RouterNavigationProvider } from './contexts/RouterNavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppRouter } from './components/Router';
import { SplashScreen } from './components/SplashScreen';
import { initializeTheme } from './utils/auth';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Light theme by default; dark only when user enabled it in profile
    initializeTheme();

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
