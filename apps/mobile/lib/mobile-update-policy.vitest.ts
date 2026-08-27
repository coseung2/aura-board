import { describe, expect, it } from "vitest";
import {
  compareVersions,
  getMobileUpdateKind,
  normalizeInstalledVersion,
  parseMobileVersionPolicy,
} from "./mobile-update-policy";

const policyInput = {
  androidLatestVersion: "2.4.0",
  iosLatestVersion: "2.4.0",
  minimumSupportedVersion: "2.0.0",
  message: "새 버전에서 더 안정적으로 사용할 수 있어요.",
  storeUrls: {
    android: "https://play.google.com/store/apps/details?id=com.aura",
    ios: "https://apps.apple.com/app/id123456789",
  },
};

describe("mobile update policy", () => {
  it("compares numeric dotted versions with omitted segments and suffixes", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.10.0", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0-beta.2", "2.0.0")).toBe(0);
  });

  it("falls back to a safe installed version when app config is unusable", () => {
    expect(normalizeInstalledVersion(undefined)).toBe("0.0.0");
    expect(normalizeInstalledVersion("dev-build")).toBe("0.0.0");
    expect(normalizeInstalledVersion(" 1.2.3 ")).toBe("1.2.3");
  });

  it("rejects malformed policies so callers can fail open", () => {
    expect(
      parseMobileVersionPolicy({
        ...policyInput,
        androidLatestVersion: "latest",
      }),
    ).toBeNull();
    expect(
      parseMobileVersionPolicy({
        ...policyInput,
        minimumSupportedVersion: "3.0.0",
      }),
    ).toBeNull();
    expect(
      parseMobileVersionPolicy({
        ...policyInput,
        storeUrls: { ...policyInput.storeUrls, ios: "not-a-url" },
      }),
    ).toBeNull();
  });

  it("classifies required, optional, and current versions", () => {
    const policy = parseMobileVersionPolicy(policyInput);
    expect(policy).not.toBeNull();
    if (!policy) return;

    expect(getMobileUpdateKind("1.9.9", policy)).toBe("required");
    expect(getMobileUpdateKind("2.3.9", policy)).toBe("optional");
    expect(getMobileUpdateKind("2.4.0", policy)).toBeNull();
  });
});
