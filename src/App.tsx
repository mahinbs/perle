import { BrowserRouter } from 'react-router-dom';
import { RouterNavigationProvider } from './contexts/RouterNavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppRouter } from './components/Router';

export default function App() {
  return (
    <BrowserRouter>
      <RouterNavigationProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </RouterNavigationProvider>
    </BrowserRouter>
  );
}
