import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletHome } from "./WalletHome";

vi.mock("./WalletCardQR", () => ({
  WalletCardQR: () => null,
}));

describe("WalletHome refresh lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("serializes initial focus checks and has no fixed snapshot poll", async () => {
    let resolveInitial!: (response: Response) => void;
    const initialResponse = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
    const payload = {
      studentName: "Student",
      classroomId: "classroom-a",
      balance: 0,
      currency: { unitLabel: "Aura", monthlyInterestRate: null },
      card: null,
      activeFDs: [],
      recentTransactions: [],
    };
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(initialResponse)
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletHome />);
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveInitial(new Response(JSON.stringify(payload), { status: 200 }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
