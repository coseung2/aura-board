import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("deprecated board stream", () => {
  it("returns a zero-DB 410 pointing callers to Broadcast plus snapshot GET", async () => {
    const response = await GET();

    expect(response.status).toBe(410);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(await response.json()).toEqual({
      error: "board_stream_deprecated",
      transport: "supabase_broadcast",
      snapshot: "/api/boards/{id}/snapshot",
    });
  });
});
