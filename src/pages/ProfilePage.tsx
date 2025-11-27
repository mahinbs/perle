import { useState, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { useToast } from "../contexts/ToastContext";
import { LoginForm } from "../components/LoginForm";
import { SignupForm } from "../components/SignupForm";
import { GoogleIcon } from "../assets/icons/GoogleIcon";
import earth from "../assets/images/earth.png";
import { 
  login, 
  signup, 
  logout, 
  verifyToken, 
  getUserData, 
  setUserData,
  getAuthHeaders,
  type User 
} from "../utils/auth";
import { IoIosArrowBack } from "react-icons/io";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export default function ProfilePage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userSettings, setUserSettings] = useState<User | null>(null);
  const [searchHistory, setSearchHistory] = useState<Array<{ id: string; query: string; mode: string; timestamp: number; created_at: string }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [updatingSetting, setUpdatingSetting] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const user = getUserData();
      if (user) {
        setIsAuthenticated(true);
        setUserSettings(user);
        // Verify token is still valid
        const verifiedUser = await verifyToken();
        if (verifiedUser) {
          setUserSettings(verifiedUser);
        } else {
          setIsAuthenticated(false);
          setUserSettings(null);
        }
      }
    };
    checkAuth();
  }, []);

  // (Profile is loaded via token verification; explicit fetch not required)

  // Fetch search history from backend
  const fetchSearchHistory = async () => {
    if (!API_URL || !isAuthenticated) return;
    
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`${API_URL}/api/search/history?limit=50`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const history = await response.json();
        setSearchHistory(history || []);
      }
    } catch (error) {
      console.error('Failed to fetch search history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load search history when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSearchHistory();
    }
  }, [isAuthenticated]);

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    setAuthError('');
    
    try {
      const response = await login(email, password);
      setIsAuthenticated(true);
      if (response.user) {
        setUserSettings(response.user as any);
      }
      setShowLogin(false);
      setShowSignup(false);
      showToast({
        message: 'Welcome back!',
        type: 'success'
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Invalid email or password';
      setAuthError(errorMessage);
      showToast({
        message: errorMessage,
        type: 'error',
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    setAuthError('');
    
    try {
      const response = await signup(name, email, password);
      
      // Check if verification is required
      if (response.requiresVerification) {
        // Save email for verification page
        localStorage.setItem('perle-verification-email', response.email || '');
        // Show success toast
        showToast({
          message: response.message || 'Please check your email for the verification code',
          type: 'success',
          duration: 5000
        });
        // Navigate to verification page
        navigateTo('/verify', { email: response.email || '' });
        return;
      }
      
      // If no verification needed (shouldn't happen with new flow)
      setIsAuthenticated(true);
      if (response.user) {
        setUserSettings(response.user as any);
      }
      setShowLogin(false);
      setShowSignup(false);
      showToast({
        message: 'Account created successfully!',
        type: 'success'
      });
    } catch (error: any) {
      // Show validation errors in toast if present (don't show form error)
      if (error.validationErrors && Array.isArray(error.validationErrors)) {
        const validationMessage = error.validationErrors.join('. ');
        // Don't set authError - only show toast
        showToast({
          message: validationMessage,
          type: 'error',
          duration: 6000
        });
      } else {
        // For non-validation errors, show both toast and form error
        const errorMessage = error.message || 'Signup failed. Please try again.';
        setAuthError(errorMessage);
        showToast({
          message: errorMessage,
          type: 'error',
          duration: 5000
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setIsAuthenticated(false);
    setUserSettings(null);
    navigateTo("/");
  };

  const handleSettingChange = async (key: string, value: boolean | string) => {
    if (!API_URL || !isAuthenticated || updatingSetting) return;

    setUpdatingSetting(key);
    const previousValue = userSettings ? (userSettings as any)[key] : null;

    // Optimistically update UI
    if (userSettings) {
      setUserSettings({ ...userSettings, [key]: value });
    }

    const updates: any = {};
    if (key === 'darkMode') {
      updates.darkMode = value;
    } else if (key === 'notifications') {
      updates.notifications = value;
    } else if (key === 'searchHistory') {
      updates.searchHistory = value;
    } else if (key === 'voiceSearch') {
      updates.voiceSearch = value;
    } else if (key === 'name') {
      updates.name = value;
    }

    try {
      const response = await fetch(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setUserSettings(updatedProfile);
        setUserData(updatedProfile);
        showToast({
          message: `${key === 'darkMode' ? 'Dark mode' : key === 'notifications' ? 'Notifications' : key === 'searchHistory' ? 'Search history' : 'Voice search'} ${value ? 'enabled' : 'disabled'}`,
          type: 'success',
          duration: 2000
        });
      } else {
        // Revert on error
        if (userSettings) {
          setUserSettings({ ...userSettings, [key]: previousValue });
        }
        showToast({
          message: 'Failed to update setting. Please try again.',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Failed to update setting:', error);
      // Revert on error
      if (userSettings) {
        setUserSettings({ ...userSettings, [key]: previousValue });
      }
      showToast({
        message: 'Failed to update setting. Please try again.',
        type: 'error'
      });
    } finally {
      setUpdatingSetting(null);
    }
  };

  const handleExportData = async () => {
    if (!API_URL || !isAuthenticated || isExporting) return;

    setIsExporting(true);
    try {
      const response = await fetch(`${API_URL}/api/profile/export`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Create downloadable JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `perle-data-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast({
          message: 'Data exported successfully!',
          type: 'success'
        });
      } else {
        showToast({
          message: 'Failed to export data. Please try again.',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      showToast({
        message: 'Failed to export data. Please try again.',
        type: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!API_URL) return;
    
    if (
      !confirm(
        "Are you sure you want to delete your account? This action cannot be undone.\n\nYou'll be asked to confirm with your password."
      )
    ) {
      return;
    }

    // Ask for password confirmation
    const password = prompt('Please enter your password to confirm deletion:');
    if (!password) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/profile`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        await logout();
        setIsAuthenticated(false);
        setUserSettings(null);
        navigateTo("/");
      } else {
        alert('Failed to delete account. Please try again.');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      alert('Failed to delete account. Please try again.');
    }
  };

  const handleGoogleAuth = async (_mode: "login" | "signup") => {
    setIsLoading(true);
    setAuthError("");

    // Google OAuth would be implemented here
    // For now, show error
    setAuthError("Google authentication is not yet implemented");
    setIsLoading(false);
  };

  // Show login form
  if (showLogin) {
    return (
      <div className="container">
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div className="h1">Sign In</div>
          <button
            className="btn-ghost"
            onClick={() => {
              setShowLogin(false);
              setAuthError('');
            }}
            style={{ fontSize: "var(--font-md)" }}
          >
            <IoIosArrowBack size={24} /> Back
          </button>
        </div>
        <LoginForm
          onLogin={handleLogin}
          onSwitchToSignup={() => {
            setShowLogin(false);
            setShowSignup(true);
            setAuthError('');
          }}
          onGoogleSignIn={() => handleGoogleAuth("login")}
          isLoading={isLoading}
          error={authError}
        />
      </div>
    );
  }

  // Show signup form
  if (showSignup) {
    return (
      <div className="container">
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div className="h1">Sign Up</div>
          <button
            className="btn-ghost"
            onClick={() => {
              setShowSignup(false);
              setAuthError('');
            }}
            style={{ fontSize: "var(--font-md)" }}
          >
            <IoIosArrowBack size={24} /> Back
          </button>
        </div>
        <SignupForm
          onSignup={handleSignup}
          onSwitchToLogin={() => {
            setShowSignup(false);
            setShowLogin(true);
            setAuthError('');
          }}
          onGoogleSignup={() => handleGoogleAuth("signup")}
          isLoading={isLoading}
          error={authError}
        />
      </div>
    );
  }

  // Show profile content
  return (
    <div className="container">
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div className="h1">Profile</div>
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/")}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
      </div>

      {/* Authentication Section */}
      {!isAuthenticated ? (
        <div className="" style={{ padding: 10, marginBottom: 20, textAlign: 'center' }}>
          {/* <div className="h3" style={{ marginBottom: 8 }}>
            Welcome to SyntraIQ
          </div>
          <div className="sub" style={{ marginBottom: 20 }}>
            Sign in to access your personalized settings and saved content
          </div>
          <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
            <button 
              className="btn" 
              onClick={() => setShowLogin(true)}
              style={{ flex: 1, maxWidth: 120 }}
              disabled={isLoading}
            >
              Sign In
            </button>
            <button 
              className="btn-ghost" 
              onClick={() => setShowSignup(true)}
              style={{ flex: 1, maxWidth: 120, opacity: isLoading ? 0.6 : 1, cursor: isLoading ? "not-allowed" : "pointer" }}
              disabled={isLoading}
            >
              Sign Up
            </button>
          </div> */}
          <div className="splash-logo relative w-full">
          {/* <img src={logo} alt="SyntraIQ logo" /> */}
          <h1 className="font-ubuntu text-4xl font-bold translate-y-1">
            Syntra <span className="text-gold font-bold!">IQ</span>
          </h1>
          <div className="relative mb-5">
            <div className="bg-linear-to-b from-transparent to-[#F8F7F4] dark:to-[#0E0E0E] absolute top-0 left-0 w-full h-full"/>
            <img src={earth} alt="Earth" className="w-full object-cover" />
          </div>
          <p className="splash-tagline font-ubuntu text-lg! font-medium">
          Preparing your Syntra<span className="text-gold">IQ</span> experience…
        </p>
        </div>
          <button
            className="btn-ghost"
            onClick={() => handleGoogleAuth("signup")}
            disabled={isLoading}
            style={{
              width: '100%',
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontWeight: 600,
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <GoogleIcon width={22} height={22} />
            Continue with Google
          </button>
          <button
            className="btn-ghost"
            onClick={() => setShowSignup(true)}
            disabled={isLoading}
            style={{
              width: "100%",
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontWeight: 600,
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                fontWeight: 700,
                fontSize: "1.6rem",
                color: "var(--text)",
              }}
            >
              @
            </span>
            Continue with Email
          </button>
        </div>
      ) : userSettings ? (
        /* User Info Card */
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="row" style={{ alignItems: "center", marginBottom: 16 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--font-2xl)",
                fontWeight: "bold",
                color: "#111",
                marginRight: 16,
              }}
            >
              {userSettings.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="h3" style={{ marginBottom: 4 }}>
                {userSettings.name}
              </div>
              <div className="sub">{userSettings.email}</div>
            </div>
          </div>
          <button 
            className="btn-ghost" 
            style={{ width: "100%" }}
            onClick={() => {
              setEditName(userSettings.name);
              setShowEditProfile(true);
            }}
          >
            Edit Profile
          </button>
        </div>
      ) : null}

      {/* Settings - Only show when authenticated */}
      {isAuthenticated && userSettings && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="h3" style={{ marginBottom: 16 }}>
            Settings
          </div>

        {/* Notifications */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>
              Notifications
            </div>
            <div className="sub text-sm">
              Receive search updates and recommendations
            </div>
          </div>
          <button
            className={`pill ${userSettings.notifications ? "active" : ""}`}
            onClick={() =>
              handleSettingChange("notifications", !userSettings.notifications)
            }
            disabled={updatingSetting === "notifications"}
            style={{ 
              minWidth: 60,
              opacity: updatingSetting === "notifications" ? 0.6 : 1,
              cursor: updatingSetting === "notifications" ? "not-allowed" : "pointer"
            }}
          >
            {updatingSetting === "notifications" ? "..." : userSettings.notifications ? "On" : "Off"}
          </button>
        </div>

        {/* Dark Mode */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Dark Mode</div>
            <div className="sub text-sm">
              Switch between light and dark themes
            </div>
          </div>
          <button
            className={`pill ${userSettings.darkMode ? "active" : ""}`}
            onClick={() =>
              handleSettingChange("darkMode", !userSettings.darkMode)
            }
            disabled={updatingSetting === "darkMode"}
            style={{ 
              minWidth: 60,
              opacity: updatingSetting === "darkMode" ? 0.6 : 1,
              cursor: updatingSetting === "darkMode" ? "not-allowed" : "pointer"
            }}
          >
            {updatingSetting === "darkMode" ? "..." : userSettings.darkMode ? "On" : "Off"}
          </button>
        </div>

        {/* Search History */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>
              Search History
            </div>
            <div className="sub text-sm">
              Save your search queries for quick access
            </div>
          </div>
          <button
            className={`pill ${userSettings.searchHistory ? "active" : ""}`}
            onClick={() =>
              handleSettingChange("searchHistory", !userSettings.searchHistory)
            }
            disabled={updatingSetting === "searchHistory"}
            style={{ 
              minWidth: 60,
              opacity: updatingSetting === "searchHistory" ? 0.6 : 1,
              cursor: updatingSetting === "searchHistory" ? "not-allowed" : "pointer"
            }}
          >
            {updatingSetting === "searchHistory" ? "..." : userSettings.searchHistory ? "On" : "Off"}
          </button>
        </div>

        {/* Voice Search */}
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Voice Search</div>
            <div className="sub text-sm">Enable voice input for searches</div>
          </div>
          <button
            className={`pill ${userSettings.voiceSearch ? "active" : ""}`}
            onClick={() =>
              handleSettingChange("voiceSearch", !userSettings.voiceSearch)
            }
            disabled={updatingSetting === "voiceSearch"}
            style={{ 
              minWidth: 60,
              opacity: updatingSetting === "voiceSearch" ? 0.6 : 1,
              cursor: updatingSetting === "voiceSearch" ? "not-allowed" : "pointer"
            }}
          >
            {updatingSetting === "voiceSearch" ? "..." : userSettings.voiceSearch ? "On" : "Off"}
          </button>
        </div>
        </div>
      )}

      {/* Search History - Only show when authenticated */}
      {isAuthenticated && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="h3" style={{ margin: 0 }}>
              Search History
            </div>
            <button
              className="btn-ghost"
              onClick={fetchSearchHistory}
              disabled={isLoadingHistory}
              style={{ 
                padding: "6px 12px", 
                fontSize: "var(--font-sm)",
                opacity: isLoadingHistory ? 0.6 : 1
              }}
            >
              {isLoadingHistory ? "Loading..." : "🔄 Refresh"}
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="sub" style={{ textAlign: "center", padding: 20 }}>
              Loading search history...
            </div>
          ) : searchHistory.length === 0 ? (
            <div className="sub" style={{ textAlign: "center", padding: 20 }}>
              No search history yet. Start searching to see your queries here!
            </div>
          ) : (
            <>
              <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 12 }}>
                {searchHistory.map((item) => (
                  <button
                    key={item.id}
                    className="btn-ghost"
                    onClick={() => {
                      navigateTo("/", { searchQuery: item.query });
                    }}
                    style={{
                      width: "100%",
                      padding: "12px",
                      marginBottom: 8,
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          marginBottom: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.query}
                      </div>
                      <div className="sub text-sm" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span>{item.mode || "Ask"}</span>
                        <span>•</span>
                        <span>
                          {new Date(item.timestamp || item.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: new Date(item.timestamp || item.created_at).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                          })}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginLeft: 12, color: "var(--accent)" }}>→</div>
                  </button>
                ))}
              </div>
              <button
                className="btn-ghost"
                onClick={async () => {
                  if (confirm("Clear all search history? This cannot be undone.")) {
                    if (API_URL) {
                      try {
                        const response = await fetch(`${API_URL}/api/search/history`, {
                          method: 'DELETE',
                          headers: getAuthHeaders(),
                        });
                        if (response.ok) {
                          setSearchHistory([]);
                          alert('Search history cleared');
                        }
                      } catch (error) {
                        console.error('Failed to clear history:', error);
                        alert('Failed to clear history');
                      }
                    } else {
                      localStorage.removeItem("perle-search-history");
                      setSearchHistory([]);
                    }
                  }
                }}
                style={{ 
                  width: "100%", 
                  color: "#ff4444",
                  borderColor: "#ff4444"
                }}
              >
                🗑️ Clear All Search History
              </button>
            </>
          )}
        </div>
      )}

      {/* Data Management - Only show when authenticated */}
      {isAuthenticated && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="h3" style={{ marginBottom: 16 }}>
            Data Management
          </div>

          <button
            className="btn-ghost"
            onClick={() => navigateTo("/spaces")}
            style={{ width: "100%", marginBottom: 12 }}
          >
            🧩 Manage Spaces
          </button>

          <button
            className="btn-ghost"
            onClick={handleExportData}
            disabled={isExporting}
            style={{ 
              width: "100%", 
              marginBottom: 12,
              opacity: isExporting ? 0.6 : 1,
              cursor: isExporting ? "not-allowed" : "pointer"
            }}
          >
            {isExporting ? "⏳ Exporting..." : "📤 Export My Data"}
          </button>

          <button
            className="btn-ghost"
            onClick={() => navigateTo("/library")}
            style={{ width: "100%" }}
          >
            📚 View My Library
          </button>
        </div>
      )}

      {/* Account Actions - Only show when authenticated */}
      {isAuthenticated && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="h3" style={{ marginBottom: 16 }}>
            Account
          </div>

        <button
          className="btn-ghost"
          onClick={handleLogout}
          style={{ width: "100%", marginBottom: 12 }}
        >
          🚪 Sign Out
        </button>

        <button
          className="btn-ghost"
          onClick={handleDeleteAccount}
          style={{
            width: "100%",
            color: "#ff4444",
            borderColor: "#ff4444",
          }}
        >
          🗑️ Delete Account
        </button>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfile && userSettings && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20
          }}
          onClick={() => setShowEditProfile(false)}
        >
          <div
            className="card"
            style={{
              padding: 24,
              maxWidth: 400,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h3" style={{ marginBottom: 20 }}>
              Edit Profile
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="edit-name"
                style={{
                  display: 'block',
                  marginBottom: 6,
                  fontWeight: 500,
                  color: 'var(--text)'
                }}
              >
                Full Name
              </label>
              <input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--card)',
                  fontSize: 'var(--font-md)'
                }}
              />
            </div>

            <div className="row" style={{ gap: 12, marginTop: 24 }}>
              <button
                className="btn-ghost"
                onClick={() => {
                  setShowEditProfile(false);
                  setEditName('');
                }}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={async () => {
                  if (editName.trim() && editName !== userSettings.name) {
                    await handleSettingChange('name', editName.trim());
                    setShowEditProfile(false);
                    setEditName('');
                  } else {
                    setShowEditProfile(false);
                    setEditName('');
                  }
                }}
                disabled={!editName.trim() || editName.trim() === userSettings.name}
                style={{ flex: 1 }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="spacer-40" />
    </div>
  );
}
