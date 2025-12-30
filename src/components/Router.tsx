import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import DiscoverPage from '../pages/DiscoverPage';
import ProfilePage from '../pages/ProfilePage';
import LibraryPage from '../pages/LibraryPage';
import DetailsPage from '../pages/DetailsPage';
import AIFriendPage from '../pages/AIFriendPage';
import AIPsychologyPage from '../pages/AIPsychologyPage';
import MaintenancePage from '../pages/MaintenancePage';
import SpacesPage from '../pages/SpacesPage';
import UpgradePlansPage from '../pages/UpgradePlansPage';
import SubscriptionPage from '../pages/SubscriptionPage';
import VerificationPage from '../pages/VerificationPage';
import TermsPage from '../pages/TermsPage';
import PrivacyPage from '../pages/PrivacyPage';

// Set this to true to enable maintenance mode
const MAINTENANCE_MODE = false;

export function AppRouter() {
  // If maintenance mode is enabled, show maintenance page for all routes
  if (MAINTENANCE_MODE) {
    return (
      <Routes>
        <Route path="*" element={<MaintenancePage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/spaces" element={<SpacesPage />} />
      <Route path="/ai-friend" element={<AIFriendPage />} />
      <Route path="/ai-psychology" element={<AIPsychologyPage />} />
      <Route path="/upgrade" element={<UpgradePlansPage />} />
      <Route path="/subscription" element={<SubscriptionPage />} />
      <Route path="/details/:id" element={<DetailsPage />} />
      <Route path="/verify" element={<VerificationPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
