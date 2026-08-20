import { describe, expect, it } from "vitest";
import {
  isMediaDegradedModeEnabled,
  MEDIA_DEGRADED_MESSAGE,
} from "./media-degraded";

describe("media degraded mode", () => {
  it("defaults to disabled when the flag is absent", () => {
    const env: { AURA_DR_MEDIA_DEGRADED_MODE?: string } = {};

    expect(isMediaDegradedModeEnabled(env)).toBe(false);
  });

  it.each(["true", "1"])("enables only for the explicit %s flag", (value) => {
    expect(
      isMediaDegradedModeEnabled({ AURA_DR_MEDIA_DEGRADED_MODE: value }),
    ).toBe(true);
  });

  it.each([undefined, "", "TRUE", "yes", "0", " true "])(
    "does not infer degraded mode from %s",
    (value) => {
      expect(
        isMediaDegradedModeEnabled({ AURA_DR_MEDIA_DEGRADED_MODE: value }),
      ).toBe(false);
    },
  );

  it("exposes one canonical Korean recovery message", () => {
    expect(MEDIA_DEGRADED_MESSAGE).toBe(
      "복구 모드로 이미지·파일과 업로드가 일시적으로 제한될 수 있습니다. 텍스트와 보드 작업은 계속 저장됩니다.",
    );
  });
});
