import { registerPlugin } from '@capacitor/core';

export interface OAuthSessionAuthenticateResult {
  callbackUrl?: string;
  cancelled?: boolean;
}

export interface OAuthSessionPlugin {
  authenticate(options: {
    url: string;
    callbackScheme: string;
  }): Promise<OAuthSessionAuthenticateResult>;
}

export const OAuthSession = registerPlugin<OAuthSessionPlugin>('OAuthSession');
