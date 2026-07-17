import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Routes that manage their own full-height shell + inner scroll (chat, studio, etc.). */
const CHAT_SHELL_PREFIXES = [
  '/app',
  '/analyze',
  '/ai-friend',
  '/ai-psychology',
  '/create',
  '/create-video',
  '/edit-images',
  '/sleep-disorders',
  '/discover',
];

/** Routes that use position:fixed and should not be wrapped in a scroll shell. */
const PASS_THROUGH_PREFIXES = ['/subscription'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

type LayoutMode = 'scroll' | 'chat' | 'pass-through';

function getLayoutMode(pathname: string): LayoutMode {
  if (matchesPrefix(pathname, PASS_THROUGH_PREFIXES)) return 'pass-through';
  if (matchesPrefix(pathname, CHAT_SHELL_PREFIXES)) return 'chat';
  return 'scroll';
}

export function AppRouteLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const mode = getLayoutMode(pathname);

  if (mode === 'chat') {
    return (
      <div className="route-chat-shell flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
        {children}
      </div>
    );
  }

  if (mode === 'pass-through') {
    return (
      <div className="route-pass-through flex flex-col flex-1 min-h-0 h-full w-full">
        {children}
      </div>
    );
  }

  const isFullBleed = pathname === '/';

  return (
    <div className="app-page-shell">
      <div className={`app-page-scroll no-scrollbar${isFullBleed ? ' app-page-scroll--flush' : ''}`}>
        {children}
      </div>
    </div>
  );
}
