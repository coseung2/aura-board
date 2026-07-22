import { describe, expect, it } from "vitest";
import { normalizeParentOAuthBaseUrl } from "../parent-oauth";

describe("parent OAuth callback base URL", () => {
  it("normalizes the Vercel alias to the canonical origin", () => {
    expect(normalizeParentOAuthBaseUrl("https://aura-board-app.vercel.app/")).toBe(
      "https://aura-board.com",
    );
  });

  it("preserves explicit localhost and non-alias overrides", () => {
    expect(normalizeParentOAuthBaseUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeParentOAuthBaseUrl("https://preview.example.test/")).toBe(
      "https://preview.example.test",
    );
  });
});
