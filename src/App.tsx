import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { RouterNavigationProvider } from './contexts/RouterNavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppRouter } from './components/Router';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
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
