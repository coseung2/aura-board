import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentNotificationBell } from "./StudentNotificationBell";

describe("StudentNotificationBell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders persisted attendance and assignment notifications and marks one read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        count: 2,
        items: [
          {
            id: "attendance:dispatch-attendance",
            kind: "attendance",
            actorLabel: "Aura Board",
            cardTitle: "오늘 출석을 확인해 주세요",
            boardTitle: "출석",
            href: "/student",
            createdAt: new Date().toISOString(),
            content: "오늘의 출석을 기록해 주세요.",
            read: false,
          },
          {
            id: "assignment:dispatch-assignment",
            kind: "assignment",
            actorLabel: "Aura Board",
            cardTitle: "새 과제가 도착했어요",
            boardTitle: "과제",
            href: "/board/homework",
            createdAt: new Date().toISOString(),
            content: "우리 반 과제를 확인해 주세요.",
            read: false,
          },
        ],
      }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentNotificationBell />);

    expect(await screen.findByText("오늘 출석을 확인해 주세요")).toBeDefined();
    expect(screen.getByText("새 과제가 도착했어요")).toBeDefined();

    fireEvent.click(screen.getByText("오늘 출석을 확인해 주세요"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/student/notifications",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "mark_read",
          kind: "attendance",
          id: "dispatch-attendance",
        }),
      }),
    ));
  });

  it("serializes the initial visibility checks and refreshes when opened", async () => {
    let resolveInitial!: (response: Response) => void;
    const initialResponse = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(initialResponse)
      .mockResolvedValue(new Response(JSON.stringify({ count: 0, items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<StudentNotificationBell />);
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveInitial(
      new Response(JSON.stringify({ count: 0, items: [] }), { status: 200 }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const summary = container.querySelector("summary");
    if (!summary) throw new Error("notification summary did not render");
    fireEvent.click(summary);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
