import { NextResponse } from "next/server";

const DEFAULT_MINIMUM_VERSION = "1.0.4";
const DEFAULT_MESSAGE = "안정성 개선";
const DEFAULT_ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.auraboard.app";
const DEFAULT_IOS_STORE_URL = "https://aura-board.com";

function validVersion(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  return candidate && /^\d+(?:\.\d+){0,3}$/.test(candidate)
    ? candidate
    : fallback;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function validStoreUrl(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function getMobileVersionPolicy() {
  const minimumSupportedVersion = validVersion(
    process.env.MOBILE_MINIMUM_SUPPORTED_VERSION,
    DEFAULT_MINIMUM_VERSION,
  );
  // Keep each store's release state independent. An unset value intentionally
  // means "no optional update" until that platform's review and release are
  // complete. The legacy variable remains a compatibility fallback for both
  // platforms during the migration.
  const legacyLatestVersion = process.env.MOBILE_LATEST_VERSION;
  const configuredLatestVersion = (platform: "ANDROID" | "IOS") => {
    const configured = validVersion(
      process.env[`MOBILE_${platform}_LATEST_VERSION`] ?? legacyLatestVersion,
      minimumSupportedVersion,
    );
    return compareVersions(configured, minimumSupportedVersion) >= 0
      ? configured
      : minimumSupportedVersion;
  };
  const configuredMessage = process.env.MOBILE_UPDATE_MESSAGE?.trim();

  return {
    androidLatestVersion: configuredLatestVersion("ANDROID"),
    iosLatestVersion: configuredLatestVersion("IOS"),
    minimumSupportedVersion,
    message: configuredMessage || DEFAULT_MESSAGE,
    storeUrls: {
      android: validStoreUrl(
        process.env.MOBILE_ANDROID_STORE_URL,
        DEFAULT_ANDROID_STORE_URL,
      ),
      ios: validStoreUrl(
        process.env.MOBILE_IOS_STORE_URL,
        DEFAULT_IOS_STORE_URL,
      ),
    },
  };
}

export async function GET() {
  return NextResponse.json(getMobileVersionPolicy(), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
