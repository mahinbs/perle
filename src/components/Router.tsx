import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import DiscoverPage from '../pages/DiscoverPage';
import ProfilePage from '../pages/ProfilePage';
import LibraryPage from '../pages/LibraryPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
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
import GalleryPage from '../pages/GalleryPage';
import MediaStudioPage from '../pages/MediaStudioPage';
import AnalyzeDocumentPage from '../pages/AnalyzeDocumentPage';
import SleepDisorderPage from '../pages/SleepDisorderPage';
import AboutPage from '../pages/AboutPage';
import HelpPage from '../pages/HelpPage';
import ContactPage from '../pages/ContactPage';
import SupportPage from '../pages/SupportPage';
import LandingPage from '../pages/LandingPage';
import RefundCancellationPage from '../pages/RefundCancellationPage';

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
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<HomePage />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/spaces" element={<SpacesPage />} />
      <Route path="/ai-friend" element={<AIFriendPage />} />
      <Route path="/ai-psychology" element={<AIPsychologyPage />} />
      <Route path="/upgrade" element={<UpgradePlansPage />} />
      <Route path="/subscription" element={<SubscriptionPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/details/:id" element={<DetailsPage />} />
      <Route path="/verify" element={<VerificationPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/terms-conditions" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/privacy-policy" element={<PrivacyPage />} />
      <Route path="/gallery" element={<GalleryPage />} />
      <Route path="/analyze" element={<AnalyzeDocumentPage />} />
      <Route path="/create" element={<MediaStudioPage />} />
      <Route path="/create-video" element={<MediaStudioPage />} />
      <Route path="/edit-images" element={<MediaStudioPage />} />
      <Route path="/sleep-disorders" element={<SleepDisorderPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/contact-us" element={<ContactPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/refund-cancellation" element={<RefundCancellationPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

