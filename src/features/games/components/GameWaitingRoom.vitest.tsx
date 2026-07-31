import "@testing-library/jest-dom/vitest";

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameWaitingRoom, type GameWaitingSnapshot } from "./GameWaitingRoom";

const emptySnapshot: GameWaitingSnapshot = {
  participants: [],
  status: "DRAFT",
};

function renderRoom(
  pollSnapshot: () => Promise<GameWaitingSnapshot | null>,
  pollEnabled: boolean,
) {
  return render(
    <GameWaitingRoom
      gameLabel=""
      title="대기실"
      message=""
      pollSnapshot={pollSnapshot}
      onReady={vi.fn()}
      pollDelayMs={20}
      pollEnabled={pollEnabled}
    />,
  );
}

describe("GameWaitingRoom realtime handoff", () => {
  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconciles once when fallback polling is disabled and does not keep polling", async () => {
    const pollSnapshot = vi.fn(async () => emptySnapshot);

    renderRoom(pollSnapshot, false);
    await waitFor(() => expect(pollSnapshot).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    expect(pollSnapshot).toHaveBeenCalledTimes(1);
  });

  it("queues the realtime reconciliation behind an in-flight fallback request", async () => {
    let resolveFirst: ((snapshot: GameWaitingSnapshot) => void) | undefined;
    const firstRequest = new Promise<GameWaitingSnapshot>((resolve) => {
      resolveFirst = resolve;
    });
    const pollSnapshot = vi
      .fn<() => Promise<GameWaitingSnapshot | null>>()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValue(emptySnapshot);

    const room = renderRoom(pollSnapshot, false);
    await waitFor(() => expect(pollSnapshot).toHaveBeenCalledTimes(1));

    room.rerender(
      <GameWaitingRoom
        gameLabel=""
        title="대기실"
        message=""
        pollSnapshot={pollSnapshot}
        onReady={vi.fn()}
        pollDelayMs={20}
        pollEnabled={true}
      />,
    );
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pollSnapshot).toHaveBeenCalledTimes(1);

    resolveFirst?.(emptySnapshot);
    await waitFor(() => expect(pollSnapshot).toHaveBeenCalledTimes(2));

    expect(pollSnapshot).toHaveBeenCalledTimes(2);
  });
});
