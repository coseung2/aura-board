export type MobileVersionPolicy = {
  androidLatestVersion: string;
  iosLatestVersion: string;
  /** Platform-selected latest version used by the shared comparison helper. */
  latestVersion: string;
  minimumSupportedVersion: string;
  message: string;
  storeUrls: {
    android: string;
    ios: string;
  };
};

export type MobileUpdateKind = "required" | "optional";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function versionSegments(value: string): number[] | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const core = normalized.split(/[+-]/, 1)[0];
  const segments = core.split(".");
  if (!/^\d+/.test(segments[0] ?? "")) return null;

  const parsed = segments.map((segment) => {
    const match = segment.match(/^\d+/);
    if (!match) return null;
    const number = Number.parseInt(match[0], 10);
    return Number.isSafeInteger(number) ? number : null;
  });

  return parsed.every((segment) => segment !== null)
    ? (parsed as number[])
    : null;
}

/** Compares dotted numeric versions, treating omitted segments as zero. */
export function compareVersions(left: string, right: string): number {
  const leftSegments = versionSegments(left);
  const rightSegments = versionSegments(right);
  if (!leftSegments || !rightSegments) return 0;

  const length = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = leftSegments[index] ?? 0;
    const rightSegment = rightSegments[index] ?? 0;
    if (leftSegment !== rightSegment) return leftSegment > rightSegment ? 1 : -1;
  }
  return 0;
}

/** Uses a safe value when Expo Go or a malformed app config has no version. */
export function normalizeInstalledVersion(value: unknown): string {
  if (typeof value !== "string") return "0.0.0";
  const normalized = value.trim();
  return versionSegments(normalized) ? normalized : "0.0.0";
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function isStoreUrl(value: unknown): value is string {
  const url = nonEmptyString(value);
  if (!url) return false;
  const scheme = url.match(/^([a-z][a-z\d+.-]*):/i)?.[1].toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "market" || scheme === "itms-apps";
}

export function parseMobileVersionPolicy(
  value: unknown,
): MobileVersionPolicy | null {
  if (!isRecord(value) || !isRecord(value.storeUrls)) return null;

  const androidLatestVersion = nonEmptyString(value.androidLatestVersion);
  const iosLatestVersion = nonEmptyString(value.iosLatestVersion);
  const minimumSupportedVersion = nonEmptyString(value.minimumSupportedVersion);
  const message = nonEmptyString(value.message);
  const android = nonEmptyString(value.storeUrls.android);
  const ios = nonEmptyString(value.storeUrls.ios);

  if (
    !androidLatestVersion ||
    !iosLatestVersion ||
    !minimumSupportedVersion ||
    !message ||
    !android ||
    !ios ||
    !versionSegments(androidLatestVersion) ||
    !versionSegments(iosLatestVersion) ||
    !versionSegments(minimumSupportedVersion) ||
    !isStoreUrl(android) ||
    !isStoreUrl(ios) ||
    compareVersions(minimumSupportedVersion, androidLatestVersion) > 0 ||
    compareVersions(minimumSupportedVersion, iosLatestVersion) > 0
  ) {
    return null;
  }

  return {
    androidLatestVersion,
    iosLatestVersion,
    latestVersion: androidLatestVersion,
    minimumSupportedVersion,
    message,
    storeUrls: { android, ios },
  };
}

export function getMobileUpdateKind(
  currentVersion: string,
  policy: MobileVersionPolicy,
): MobileUpdateKind | null {
  if (compareVersions(currentVersion, policy.minimumSupportedVersion) < 0) {
    return "required";
  }
  if (compareVersions(currentVersion, policy.latestVersion) < 0) {
    return "optional";
  }
  return null;
}
