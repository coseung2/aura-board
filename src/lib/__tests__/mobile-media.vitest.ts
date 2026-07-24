import { describe, expect, it } from "vitest";
import {
  buildCanvaEmbedUrl,
  buildMediaItems,
  buildYouTubeEmbedUrl,
  classifyMediaUrl,
  embedOriginWhitelist,
  findPlayableMediaUrl,
  isAllowedEmbedNavigation,
  mediaPreviewUrls,
  MOBILE_EMBED_ORIGIN,
} from "../../../apps/mobile/lib/media";

describe("mobile media previews", () => {
  it("renders one preview for an attachment mirrored in legacy image fields", () => {
    const items = buildMediaItems({
      imageUrl: "https://cdn.example.com/image.jpg",
      thumbUrl: "https://cdn.example.com/image-thumb.jpg",
      attachments: [
        {
          id: "attachment-1",
          kind: "image",
          url: "https://cdn.example.com/image.jpg",
          previewUrl: "https://cdn.example.com/image-thumb.jpg",
          fileName: null,
          fileSize: null,
          mimeType: "image/jpeg",
          order: 0,
        },
      ],
    });

    expect(mediaPreviewUrls(items)).toEqual([
      "https://cdn.example.com/image-thumb.jpg",
    ]);
  });

  it("renders one preview per logical image attachment", () => {
    const items = buildMediaItems({
      attachments: [
        {
          id: "attachment-1",
          kind: "image",
          url: "https://cdn.example.com/one.jpg",
          previewUrl: "https://cdn.example.com/one-thumb.jpg",
          fileName: null,
          fileSize: null,
          mimeType: "image/jpeg",
          order: 0,
        },
        {
          id: "attachment-2",
          kind: "image",
          url: "https://cdn.example.com/two.jpg",
          previewUrl: "https://cdn.example.com/two-thumb.jpg",
          fileName: null,
          fileSize: null,
          mimeType: "image/jpeg",
          order: 1,
        },
      ],
    });

    expect(mediaPreviewUrls(items)).toEqual([
      "https://cdn.example.com/one-thumb.jpg",
      "https://cdn.example.com/two-thumb.jpg",
    ]);
  });

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

  it("normalizes Canva embed share URLs to the shared player URL", () => {
    expect(
      buildCanvaEmbedUrl(
        "https://www.canva.com/design/DAFabc123/TOKEN_456/embed",
      ),
    ).toBe("https://www.canva.com/design/DAFabc123/TOKEN_456/view?embed&meta");
  });

  it("resolves playable attachments before stale legacy links", () => {
    const youtubeUrl = "https://youtu.be/dQw4w9WgXcQ";
    expect(
      findPlayableMediaUrl({
        attachments: [
          {
            id: "youtube-attachment",
            kind: "link",
            url: youtubeUrl,
            previewUrl: null,
            fileName: null,
            fileSize: null,
            mimeType: null,
            order: 0,
          },
        ],
        linkUrl: "https://example.com/stale-preview",
      }),
    ).toBe(youtubeUrl);
  });

  it("resolves legacy video URLs through the same player path", () => {
    const canvaUrl =
      "https://www.canva.com/design/DAFabc123/TOKEN_456/view";
    expect(findPlayableMediaUrl({ videoUrl: canvaUrl })).toBe(canvaUrl);
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

  it("allows only the expected top-level YouTube embed navigation", () => {
    const embedUrl = buildYouTubeEmbedUrl("dQw4w9WgXcQ");

    expect(embedOriginWhitelist()).toEqual(["*"]);
    expect(
      isAllowedEmbedNavigation(
        `${MOBILE_EMBED_ORIGIN}/mobile-embed/youtube/`,
        "youtube",
        embedUrl,
      ),
    ).toBe(true);
    expect(
      isAllowedEmbedNavigation(embedUrl, "youtube", embedUrl),
    ).toBe(true);
    expect(
      isAllowedEmbedNavigation("https://example.com/phishing", "youtube", embedUrl),
    ).toBe(false);
  });

  it("blocks Canva navigation outside canonical design pages", () => {
    const embedUrl = buildCanvaEmbedUrl(
      "https://www.canva.com/design/DAFabc123/TOKEN_456/view",
    );

    expect(embedUrl).not.toBeNull();
    expect(
      isAllowedEmbedNavigation(embedUrl!, "canva", embedUrl),
    ).toBe(true);
    expect(
      isAllowedEmbedNavigation("https://www.canva.com/login", "canva", embedUrl),
    ).toBe(false);
    expect(
      isAllowedEmbedNavigation("https://example.com/redirect", "canva", embedUrl),
    ).toBe(false);
  });
});
