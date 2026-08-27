import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/mobile/version-policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a public default policy for the current mobile release", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    await expect(response.json()).resolves.toEqual({
      androidLatestVersion: "1.0.4",
      iosLatestVersion: "1.0.4",
      minimumSupportedVersion: "1.0.4",
      message: "안정성 개선",
      storeUrls: {
        android:
          "https://play.google.com/store/apps/details?id=com.auraboard.app",
        ios: "https://aura-board.com",
      },
    });
  });

  it("uses deployment configuration and never reports latest below minimum", async () => {
    vi.stubEnv("MOBILE_MINIMUM_SUPPORTED_VERSION", "2.4.0");
    vi.stubEnv("MOBILE_LATEST_VERSION", "2.3.9");
    vi.stubEnv("MOBILE_UPDATE_MESSAGE", "새 버전으로 업데이트해 주세요.");
    vi.stubEnv(
      "MOBILE_ANDROID_STORE_URL",
      "https://example.com/android-download",
    );
    vi.stubEnv("MOBILE_IOS_STORE_URL", "http://insecure.example.com/ios");

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      androidLatestVersion: "2.4.0",
      iosLatestVersion: "2.4.0",
      minimumSupportedVersion: "2.4.0",
      message: "새 버전으로 업데이트해 주세요.",
      storeUrls: {
        android: "https://example.com/android-download",
        ios: "https://aura-board.com",
      },
    });
  });

  it("falls back safely when version configuration is malformed", async () => {
    vi.stubEnv("MOBILE_MINIMUM_SUPPORTED_VERSION", "release-2");
    vi.stubEnv("MOBILE_LATEST_VERSION", "2.x");

    const response = await GET();
    const body = await response.json();

    expect(body.minimumSupportedVersion).toBe("1.0.4");
    expect(body.androidLatestVersion).toBe("1.0.4");
    expect(body.iosLatestVersion).toBe("1.0.4");
  });
});
