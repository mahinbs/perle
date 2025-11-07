import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { LoginForm } from "../components/LoginForm";
import { SignupForm } from "../components/SignupForm";

export default function ProfilePage() {
  const { navigateTo } = useRouterNavigation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userSettings, setUserSettings] = useState({
    name: "John Doe",
    email: "john.doe@example.com",
    notifications: true,
    darkMode: false,
    searchHistory: true,
    voiceSearch: true,
  });

  const handleSettingChange = (key: string, value: boolean | string) => {
    setUserSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    setAuthError('');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Demo credentials check
      if (email === 'demo@perle.com' && password === 'demo123') {
        setIsAuthenticated(true);
        setShowLogin(false);
        setShowSignup(false);
        setUserSettings(prev => ({ ...prev, email }));
      } else {
        setAuthError('Invalid email or password');
      }
    } catch (error) {
      setAuthError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (name: string, email: string, _password: string) => {
    setIsLoading(true);
    setAuthError('');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate successful signup
      setIsAuthenticated(true);
      setShowLogin(false);
      setShowSignup(false);
      setUserSettings(prev => ({ ...prev, name, email }));
    } catch (error) {
      setAuthError('Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserSettings({
      name: "John Doe",
      email: "john.doe@example.com",
      notifications: true,
      darkMode: false,
      searchHistory: true,
      voiceSearch: true,
    });
    navigateTo("/");
  };

  const handleExportData = () => {
    // In a real app, this would export user data
    console.log("Exporting data...");
  };

  const handleDeleteAccount = () => {
    // In a real app, this would show a confirmation dialog
    if (
      confirm(
        "Are you sure you want to delete your account? This action cannot be undone."
      )
    ) {
      console.log("Deleting account...");
      navigateTo("/");
    }
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
            ← Back
          </button>
        </div>
        <LoginForm
          onLogin={handleLogin}
          onSwitchToSignup={() => {
            setShowLogin(false);
            setShowSignup(true);
            setAuthError('');
          }}
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
            ← Back
          </button>
        </div>
        <SignupForm
          onSignup={handleSignup}
          onSwitchToLogin={() => {
            setShowSignup(false);
            setShowLogin(true);
            setAuthError('');
          }}
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
          ← Back
        </button>
      </div>

      {/* Authentication Section */}
      {!isAuthenticated ? (
        <div className="card" style={{ padding: 20, marginBottom: 20, textAlign: 'center' }}>
          <div className="h3" style={{ marginBottom: 8 }}>
            Welcome to Perlé
          </div>
          <div className="sub" style={{ marginBottom: 20 }}>
            Sign in to access your personalized settings and saved content
          </div>
          <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
            <button 
              className="btn" 
              onClick={() => setShowLogin(true)}
              style={{ flex: 1, maxWidth: 120 }}
            >
              Sign In
            </button>
            <button 
              className="btn-ghost" 
              onClick={() => setShowSignup(true)}
              style={{ flex: 1, maxWidth: 120 }}
            >
              Sign Up
            </button>
          </div>
        </div>
      ) : (
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
              {userSettings.name.charAt(0)}
            </div>
            <div>
              <div className="h3" style={{ marginBottom: 4 }}>
                {userSettings.name}
              </div>
              <div className="sub">{userSettings.email}</div>
            </div>
          </div>
          <button className="btn-ghost" style={{ width: "100%" }}>
            Edit Profile
          </button>
        </div>
      )}

      {/* Settings - Only show when authenticated */}
      {isAuthenticated && (
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
            style={{ minWidth: 60 }}
          >
            {userSettings.notifications ? "On" : "Off"}
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
            style={{ minWidth: 60 }}
          >
            {userSettings.darkMode ? "On" : "Off"}
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
            style={{ minWidth: 60 }}
          >
            {userSettings.searchHistory ? "On" : "Off"}
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
            style={{ minWidth: 60 }}
          >
            {userSettings.voiceSearch ? "On" : "Off"}
          </button>
        </div>
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
            style={{ width: "100%", marginBottom: 12 }}
          >
            📤 Export My Data
          </button>

          <button
            className="btn-ghost"
            onClick={() => navigateTo("/library")}
            style={{ width: "100%", marginBottom: 12 }}
          >
            📚 View My Library
          </button>

          <button
            className="btn-ghost"
            onClick={() => {
              if (confirm("Clear all search history?")) {
                localStorage.removeItem("perle-search-history");
                console.log("Search history cleared");
              }
            }}
            style={{ width: "100%" }}
          >
            🗑️ Clear Search History
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

      <div className="spacer-40" />
    </div>
  );
}
