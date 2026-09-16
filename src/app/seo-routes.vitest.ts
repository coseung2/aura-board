import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { metadata as rootMetadata } from "./layout";
import { metadata as landingMetadata } from "./landing/page";
import { metadata as loginMetadata } from "./login/layout";
import { metadata as privacyMetadata } from "./privacy/page";
import robots from "./robots";
import sitemap from "./sitemap";
import { metadata as supportMetadata } from "./support/page";
import { metadata as termsMetadata } from "./terms/page";

describe("public SEO routes", () => {
  it("uses exact self-canonicals for indexable public pages", () => {
    expect(landingMetadata.alternates?.canonical).toBe("/landing");
    expect(privacyMetadata.alternates?.canonical).toBe("/privacy");
    expect(termsMetadata.alternates?.canonical).toBe("/terms");
    expect(supportMetadata.alternates?.canonical).toBe("/support");
    expect(landingMetadata.openGraph?.url).toBe("https://aura-board.com/landing");
  });

  it("publishes a conventional crawlable favicon with explicit fallback metadata", () => {
    const favicon = readFileSync("src/app/favicon.ico");
    expect(favicon.readUInt16LE(0)).toBe(0);
    expect(favicon.readUInt16LE(2)).toBe(1);
    expect(favicon.readUInt16LE(4)).toBe(2);
    expect([favicon[6], favicon[22]]).toEqual([32, 96]);
    expect(rootMetadata.icons).toMatchObject({
      shortcut: "/favicon.ico",
      apple: [
        {
          url: "/aura-app-icon-512.png",
          type: "image/png",
          sizes: "512x512",
        },
      ],
    });
  });

  it("keeps login crawlable but out of the index", () => {
    expect(loginMetadata.alternates?.canonical).toBe("/login");
    expect(loginMetadata.robots).toMatchObject({ index: false, follow: true });
  });

  it("advertises only stable public canonical URLs", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://aura-board.com/sitemap.xml",
    });
    expect(sitemap().map(({ url }) => url)).toEqual([
      "https://aura-board.com/landing",
      "https://aura-board.com/privacy",
      "https://aura-board.com/terms",
      "https://aura-board.com/support",
    ]);
  });

  it("consolidates the legacy privacy URL and permits the GTM fallback frame", async () => {
    expect(await nextConfig.redirects?.()).toContainEqual({
      source: "/privacy.html",
      destination: "/privacy",
      permanent: true,
    });

    const headers = await nextConfig.headers?.();
    const contentSecurityPolicy = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy");
    expect(contentSecurityPolicy?.value).toContain("https://www.googletagmanager.com");
  });
});
