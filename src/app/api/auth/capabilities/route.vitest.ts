import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/auth/capabilities", () => {
  it("reports role-specific availability without returning credentials", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "shared-google-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "shared-google-secret");
    vi.stubEnv("KAKAO_PARENT_CLIENT_ID", "");
    vi.stubEnv("KAKAO_PARENT_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_APPLE_ID", "apple-services-id");
    vi.stubEnv("AUTH_APPLE_SECRET", "apple-client-secret");

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      teacher: { google: true, kakao: false, apple: true, password: true },
      parent: { google: true, kakao: false, apple: true, password: true },
      student: { code: true },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("can enable parent Google independently from teacher Google", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    vi.stubEnv("GOOGLE_PARENT_CLIENT_ID", "parent-google-id");
    vi.stubEnv("GOOGLE_PARENT_CLIENT_SECRET", "parent-google-secret");

    const body = await (await GET()).json();
    expect(body.teacher.google).toBe(false);
    expect(body.parent.google).toBe(true);
  });
});
