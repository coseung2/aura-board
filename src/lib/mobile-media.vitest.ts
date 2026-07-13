import { describe, expect, it } from "vitest";
import {
  buildCanvaEmbedUrl,
  buildYouTubeEmbedUrl,
  classifyMediaUrl,
  MOBILE_EMBED_ORIGIN,
} from "../../apps/mobile/lib/media";

describe("mobile media embeds", () => {
  it("identifies the native WebView origin in YouTube player URLs", () => {
    const embed = new URL(buildYouTubeEmbedUrl("dQw4w9WgXcQ"));

    expect(embed.origin).toBe("https://www.youtube.com");
    expect(embed.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(embed.searchParams.get("enablejsapi")).toBe("1");
    expect(embed.searchParams.get("playsinline")).toBe("1");
    expect(embed.searchParams.get("origin")).toBe(MOBILE_EMBED_ORIGIN);
    expect(embed.searchParams.get("widget_referrer")).toBe(MOBILE_EMBED_ORIGIN);
  });

  it("preserves a Canva public-share token while rewriting edit to view", () => {
    expect(
      buildCanvaEmbedUrl(
        "https://www.canva.com/design/DAFabc123/TOKEN_456/edit?utm_source=share",
      ),
    ).toBe("https://www.canva.com/design/DAFabc123/TOKEN_456/view?embed&meta");
  });

  it("does not treat unresolved Canva short links as live embeds", () => {
    expect(classifyMediaUrl("https://www.canva.link/example")).toEqual({
      kind: null,
      embedUrl: null,
      externalUrl: "https://www.canva.link/example",
    });
  });

  it("classifies YouTube watch URLs with the hardened embed URL", () => {
    const classified = classifyMediaUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(classified.kind).toBe("youtube");
    expect(classified.embedUrl).not.toBeNull();
    const embed = new URL(classified.embedUrl!);
    expect(embed.searchParams.get("origin")).toBe(MOBILE_EMBED_ORIGIN);
  });
});
