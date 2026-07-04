import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { RouterNavigationProvider } from './contexts/RouterNavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppRouter } from './components/Router';
import { AppRouteLayout } from './components/AppRouteLayout';
import { SplashScreen } from './components/SplashScreen';
import { initializeTheme, initializeAuthSession, registerAuthSessionListeners } from './utils/auth';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Light theme by default; dark only when user enabled it in profile
    initializeTheme();
    registerAuthSessionListeners();
    void initializeAuthSession();

    const timer = window.setTimeout(() => setShowSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BrowserRouter>
      <RouterNavigationProvider>
        <ToastProvider>
          <div className="app-root-outlet">
            {showSplash ? <SplashScreen /> : (
              <AppRouteLayout>
                <AppRouter />
              </AppRouteLayout>
            )}
          </div>
        </ToastProvider>
      </RouterNavigationProvider>
    </BrowserRouter>
  );
}
