import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), realtime: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/share-board", () => ({ fetchShareBoard: mocks.fetch, ShareBoardUnavailableError: class extends Error {} }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: mocks.realtime }));
vi.mock("./ShareBoardWrapper", () => ({ ShareBoardWrapper: ({ board }: { board: { title: string } }) => <div data-testid="board">{board.title}</div> }));
vi.mock("@/lib/supabase/client", () => ({ createPublicSupabaseClient: () => {
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return { channel: () => channel, removeChannel: mocks.remove };
} }));
import { ShareBoardUnavailableError } from "@/lib/supabase/share-board";
import { SupabaseShareBoardClient } from "./SupabaseShareBoardClient";
const payload = (title: string) => ({ board: { id: "board-1", title }, shareToken: "token", initialCards: [], initialSections: [] });

describe("shared board recovery", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue(payload("current")); });
  afterEach(cleanup);
  it("joins the ordinary recovery transport and clears revoked shared content", async () => {
    render(<SupabaseShareBoardClient lookupKind="shareToken" lookupValue="token" />);
    await screen.findByText("current");
    const options = mocks.realtime.mock.calls.at(-1)![0];
    expect(options.enabled).toBe(true);
    expect(options.channelName).toBe("board:board-1");
    expect(options.fallbackPollMs).toBe(30_000);
    mocks.fetch.mockRejectedValueOnce(new ShareBoardUnavailableError());
    await act(async () => { await options.refresh().catch(() => undefined); });
    expect(screen.queryByTestId("board")).toBeNull();
  });
  it("does not let a late response from a previous share link replace the new board", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<SupabaseShareBoardClient lookupKind="shareToken" lookupValue="old-token" />);
    view.rerender(<SupabaseShareBoardClient lookupKind="shareToken" lookupValue="new-token" />);
    await screen.findByText("current");
    await act(async () => resolveOld(payload("old")));
    await waitFor(() => expect(screen.getByTestId("board").textContent).toBe("current"));
  });
});
