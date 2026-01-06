// Vite exposes env variables via import.meta.env
const API_URL = import.meta.env.VITE_API_URL as string | undefined;

// Debug: Log API URL in development (will be removed in production)
if (import.meta.env.DEV) {
  console.log('🔧 API_URL:', API_URL || 'NOT SET - Please add VITE_API_URL to .env file');
}

const AUTH_TOKEN_KEY = 'perle-auth-token';
const USER_DATA_KEY = 'perle-user-data';

export interface User {
  id: string;
  name: string;
  email: string;
  notifications: boolean;
  darkMode: boolean;
  searchHistory: boolean;
  voiceSearch: boolean;
  isPremium?: boolean;
  premiumTier?: 'free' | 'pro' | 'max';
  subscription?: {
    status: string;
    tier: string;
    endDate: string | null;
    autoRenew: boolean;
  };
}

export interface AuthResponse {
  token?: string;
  user?: User;
  requiresVerification?: boolean;
  email?: string;
  message?: string;
  devOTP?: string; // Only in development
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
}

export function getUserData(): User | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(USER_DATA_KEY);
  return data ? JSON.parse(data) : null;
}

export function setUserData(user: User): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
}

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  if (!API_URL) {
    throw new Error('Backend API not configured. Please set VITE_API_URL in your .env file (e.g., VITE_API_URL=http://localhost:3333). Make sure your backend server is running.');
  }

  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  const data: AuthResponse = await response.json();
  if (data.token) {
    setAuthToken(data.token);
  }
  if (data.user) {
    setUserData(data.user);
  }
  return data;
}

export async function signup(name: string, email: string, password: string): Promise<AuthResponse> {
  if (!API_URL) {
    throw new Error('Backend API not configured. Please set VITE_API_URL in your .env file (e.g., VITE_API_URL=http://localhost:3333). Make sure your backend server is running.');
  }

  const response = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Signup failed' }));
    
    // Parse validation errors if present
    if (errorData.details && typeof errorData.details === 'object') {
      const validationErrors: string[] = [];
      Object.entries(errorData.details).forEach(([_field, errors]) => {
        if (Array.isArray(errors)) {
          errors.forEach((err: string) => {
            validationErrors.push(err);
          });
        }
      });
      
      if (validationErrors.length > 0) {
        const error = new Error(errorData.error || 'Validation failed');
        (error as any).validationErrors = validationErrors;
        throw error;
      }
    }
    
    throw new Error(errorData.error || 'Signup failed');
  }

  const data: AuthResponse = await response.json();
  
  // If verification required, return without setting token
  if (data.requiresVerification) {
    return data;
  }
  
  // If token and user provided, set them
  if (data.token && data.user) {
    setAuthToken(data.token);
    setUserData(data.user);
  }
  
  return data;
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  if (token && API_URL) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  removeAuthToken();
}

export async function verifyToken(): Promise<User | null> {
  const token = getAuthToken();
  if (!token || !API_URL) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    // If 401, token is invalid - silently clear and return null
    if (response.status === 401) {
      removeAuthToken();
      return null;
    }

    if (!response.ok) {
      removeAuthToken();
      return null;
    }

    const data = await response.json();
    setUserData(data.user);
    return data.user;
  } catch (error) {
    // Silently handle errors - don't show error messages for token verification
    removeAuthToken();
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

// Helper function to handle API responses and check for authentication errors
export async function handleApiResponse<T>(
  response: Response,
  onUnauthorized?: () => void
): Promise<T> {
  // If 401 Unauthorized, clear auth and handle gracefully
  if (response.status === 401) {
    removeAuthToken();
    if (onUnauthorized) {
      onUnauthorized();
    }
    // Return a rejected promise with a user-friendly message
    const errorData = await response.json().catch(() => ({ error: 'Session expired. Please log in again.' }));
    throw new Error(errorData.error || 'Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return await response.json();
}

// Enhanced fetch wrapper that handles authentication errors
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  onUnauthorized?: () => void
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If 401, clear auth immediately
  if (response.status === 401) {
    removeAuthToken();
    if (onUnauthorized) {
      onUnauthorized();
    }
  }

  return response;
}

