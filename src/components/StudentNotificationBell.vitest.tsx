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
});
