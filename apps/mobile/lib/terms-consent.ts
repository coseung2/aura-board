import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// First-run terms acceptance (App Store guideline 1.2).
//
// Apple requires the agreement to be presented before a user registers or logs
// in. The accepted version is stored so a future terms revision can re-prompt
// without a second storage key.

const CONSENT_KEY = "aura_terms_consent_version";

/** Bump when the terms change in a way that requires fresh acceptance. */
export const TERMS_VERSION = "2026-07-25.2";

function canUseWebStorage(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

export async function loadAcceptedTermsVersion(): Promise<string | null> {
  try {
    if (canUseWebStorage()) return window.localStorage.getItem(CONSENT_KEY);
    return (await SecureStore.getItemAsync(CONSENT_KEY)) ?? null;
  } catch {
    // Treat unreadable storage as "not yet accepted" so the gate still shows.
    return null;
  }
}

export async function acceptCurrentTerms(): Promise<void> {
  if (canUseWebStorage()) {
    window.localStorage.setItem(CONSENT_KEY, TERMS_VERSION);
    return;
  }
  await SecureStore.setItemAsync(CONSENT_KEY, TERMS_VERSION);
}

export function isTermsAccepted(storedVersion: string | null): boolean {
  return storedVersion === TERMS_VERSION;
}
