import { registerPlugin } from '@capacitor/core';

export interface AppleSignInFullName {
  givenName?: string;
  familyName?: string;
}

export interface AppleSignInResult {
  identityToken?: string;
  nonce?: string;
  email?: string;
  fullName?: AppleSignInFullName;
  cancelled?: boolean;
}

export interface AppleSignInPlugin {
  signIn(): Promise<AppleSignInResult>;
}

export const AppleSignIn = registerPlugin<AppleSignInPlugin>('AppleSignIn');
