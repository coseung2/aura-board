import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  extractChannelHandle,
  extractVideoId,
  isYouTubeChannelUrl,
} from "../youtube";

const VIDEO_ID = "abcDEF123_4";
const CHANNEL_ID = "UCabcdefghijklmnopqrstuv"; // 24 chars, UC prefix

describe("youtube url parsing", () => {
  it("extracts ids from common watch and short urls", () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
    expect(extractVideoId(`https://youtu.be/${VIDEO_ID}?t=12`)).toBe(VIDEO_ID);
    expect(extractVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
  });

  it("extracts ids from embed and live urls used by stored media", () => {
    expect(extractVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
    expect(
      extractVideoId(`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`)
    ).toBe(VIDEO_ID);
    expect(extractVideoId(`https://www.youtube.com/live/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
  });

  it("rejects non-youtube and malformed ids", () => {
    expect(extractVideoId(`https://example.com/watch?v=${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId("https://www.youtube.com/embed/not-an-id")).toBeNull();
  });

  it("canonicalizes ids to watch urls", () => {
    expect(canonicalUrl(VIDEO_ID)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    );
  });
});

describe("youtube channel handle parsing", () => {
  it("parses @handle urls and canonicalises to www.youtube.com", () => {
    const result = extractChannelHandle("https://www.youtube.com/@jayychoii");
    expect(result).toEqual({
      kind: "handle",
      handle: "jayychoii",
      canonicalUrl: "https://www.youtube.com/@jayychoii",
    });
  });

  it("strips trailing path segments from handle urls", () => {
    const result = extractChannelHandle(
      "https://www.youtube.com/@jayy.choii/featured"
    );
    expect(result).toEqual({
      kind: "handle",
      handle: "jayy.choii",
      canonicalUrl: "https://www.youtube.com/@jayy.choii",
    });
  });

  it("parses /channel/<UC…> urls", () => {
    const result = extractChannelHandle(
      `https://www.youtube.com/channel/${CHANNEL_ID}`
    );
    expect(result).toEqual({
      kind: "channel",
      channelId: CHANNEL_ID,
      canonicalUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    });
  });

  it("parses /c/<custom> urls", () => {
    const result = extractChannelHandle(
      "https://www.youtube.com/c/MKBHD"
    );
    expect(result).toEqual({
      kind: "custom",
      customName: "MKBHD",
      canonicalUrl: "https://www.youtube.com/c/MKBHD",
    });
  });

  it("parses legacy /user/<name> urls", () => {
    const result = extractChannelHandle(
      "https://www.youtube.com/user/pbsdigitalstudios"
    );
    expect(result).toEqual({
      kind: "user",
      userName: "pbsdigitalstudios",
      canonicalUrl: "https://www.youtube.com/user/pbsdigitalstudios",
    });
  });

  it("strips tracking query parameters from channel urls", () => {
    const result = extractChannelHandle(
      "https://www.youtube.com/@jayychoii?sub_confirmation=1&utm_source=feed"
    );
    expect(result).toEqual({
      kind: "handle",
      handle: "jayychoii",
      canonicalUrl: "https://www.youtube.com/@jayychoii",
    });
  });

  it("returns null for video urls (caller should route to extractVideoId)", () => {
    expect(
      extractChannelHandle(`https://www.youtube.com/watch?v=${VIDEO_ID}`)
    ).toBeNull();
    expect(extractChannelHandle(`https://youtu.be/${VIDEO_ID}`)).toBeNull();
  });

  it("rejects non-youtube hosts and malformed channel ids", () => {
    expect(
      extractChannelHandle(`https://example.com/channel/${CHANNEL_ID}`)
    ).toBeNull();
    // Channel ids must start with UC and be exactly 24 chars.
    expect(
      extractChannelHandle(`https://www.youtube.com/channel/XX${CHANNEL_ID.slice(2)}`)
    ).toBeNull();
    expect(
      extractChannelHandle(`https://www.youtube.com/channel/${CHANNEL_ID}x`)
    ).toBeNull();
  });

  it("isYouTubeChannelUrl mirrors extractChannelHandle", () => {
    expect(isYouTubeChannelUrl("https://www.youtube.com/@jayychoii")).toBe(true);
    expect(isYouTubeChannelUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(
      false
    );
    expect(isYouTubeChannelUrl("https://example.com/foo")).toBe(false);
    expect(isYouTubeChannelUrl(null)).toBe(false);
  });
});
