import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MEDIA_DEGRADED_MESSAGE } from "@/lib/media-degraded";
import { MediaDegradedNotice } from "./MediaDegradedNotice";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("MediaDegradedNotice", () => {
  it("is hidden when degraded mode is disabled", () => {
    vi.stubEnv("AURA_DR_MEDIA_DEGRADED_MODE", "false");

    render(<MediaDegradedNotice />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the canonical recovery message when enabled", () => {
    vi.stubEnv("AURA_DR_MEDIA_DEGRADED_MODE", "1");

    render(<MediaDegradedNotice />);

    expect(screen.getByRole("status").textContent).toBe(MEDIA_DEGRADED_MESSAGE);
  });
});
