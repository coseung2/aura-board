import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { parentApiFetch } from "./api";

type AppleParentSession = {
  token: string;
  expiresAt: string;
  isNewParent: boolean;
};

export async function isAppleParentLoginAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithAppleParent(): Promise<AppleParentSession> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error("apple_identity_token_missing");
  }

  const displayName = [
    credential.fullName?.givenName,
    credential.fullName?.middleName,
    credential.fullName?.familyName,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  return parentApiFetch<AppleParentSession>("/api/parent/auth/apple", {
    method: "POST",
    json: {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      displayName: displayName || null,
    },
    skipAuth: true,
  });
}

export function isAppleLoginCancellation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code) === "ERR_REQUEST_CANCELED",
  );
}
