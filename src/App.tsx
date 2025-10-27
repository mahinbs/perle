import { BrowserRouter } from 'react-router-dom';
import { RouterNavigationProvider } from './contexts/RouterNavigationContext';
import { AppRouter } from './components/Router';

export default function App() {
  return (
    <BrowserRouter>
      <RouterNavigationProvider>
        <AppRouter />
      </RouterNavigationProvider>
    </BrowserRouter>
  );
}
