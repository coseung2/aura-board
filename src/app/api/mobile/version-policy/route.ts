import { NextResponse } from "next/server";

const DEFAULT_VERSION = "1.0.4";
const DEFAULT_MESSAGE =
  "더 안정적인 Aura Board를 사용하려면 최신 버전으로 업데이트해 주세요.";
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
    DEFAULT_VERSION,
  );
  const configuredLatestVersion = validVersion(
    process.env.MOBILE_LATEST_VERSION,
    minimumSupportedVersion,
  );
  const latestVersion =
    compareVersions(configuredLatestVersion, minimumSupportedVersion) >= 0
      ? configuredLatestVersion
      : minimumSupportedVersion;
  const configuredMessage = process.env.MOBILE_UPDATE_MESSAGE?.trim();

  return {
    latestVersion,
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
