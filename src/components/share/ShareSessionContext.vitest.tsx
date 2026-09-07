import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/share-api", () => ({ handleShareApiFetch: vi.fn(async () => null) }));
import { ShareSessionProvider } from "./ShareSessionContext";

describe("share fetch bridge", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("keeps share credentials when the asynchronous read adapter declines a mutation", async () => {
    const original = vi.fn<typeof fetch>(async () => new Response("{}"));
    vi.stubGlobal("fetch", original);
    render(<ShareSessionProvider shareToken="board-token" shareMode="student"><div /></ShareSessionProvider>);
    await window.fetch("/api/cards/card-1", { method: "DELETE" });
    expect(original).toHaveBeenCalledOnce();
    const init = original.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(init.method).toBe("DELETE");
    expect(headers.get("x-share-token")).toBe("board-token");
    expect(headers.get("x-share-guest-id")).toBeTruthy();
    expect(headers.get("x-share-author-name")).toBeTruthy();
  });
  it("never adds share credentials to another origin", async () => {
    const original = vi.fn<typeof fetch>(async () => new Response("{}"));
    vi.stubGlobal("fetch", original);
    render(<ShareSessionProvider shareToken="board-token" shareMode="student"><div /></ShareSessionProvider>);
    await window.fetch("https://other.example/api/cards");
    expect(original.mock.calls[0][1]).toBeUndefined();
  });
});
