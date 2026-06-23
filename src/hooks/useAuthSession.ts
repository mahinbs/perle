import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getUserData,
  isLoggedIn,
  onAuthChange,
  type User,
} from '../utils/auth';

function subscribe(listener: () => void): () => void {
  return onAuthChange(listener);
}

function getLoggedInSnapshot(): boolean {
  return isLoggedIn();
}

/** Reactive login state — updates when tokens expire, refresh fails, or user logs out. */
export function useAuthSession(): { isLoggedIn: boolean; user: User | null } {
  const loggedIn = useSyncExternalStore(subscribe, getLoggedInSnapshot, () => false);
  const [user, setUser] = useState<User | null>(() => getUserData());

  useEffect(() => {
    const sync = () => setUser(getUserData());
    sync();
    return onAuthChange(sync);
  }, []);

  return { isLoggedIn: loggedIn, user };
}
