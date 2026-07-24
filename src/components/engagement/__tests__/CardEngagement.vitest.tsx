import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardEngagement } from "../CardEngagement";
import type { BoardEngagementEvent } from "@/hooks/useBoardEngagementRealtime";

const engagementHookMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useBoardEngagementRealtime", () => ({
  useBoardEngagement: engagementHookMock,
  useBoardPollChange: vi.fn(),
}));

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function response(data: unknown, ok = true): JsonResponse {
  return { ok, json: async () => data };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("CardEngagement comment realtime", () => {
  beforeEach(() => {
    engagementHookMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("uses complete server engagement state without a blocking engagement fetch", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) =>
      Promise.resolve(response({}, false)),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardEngagement
        cardId="server-state-card"
        boardId="board-server-state"
        mode="chips"
        initialCounts={{
          likeCount: 3,
          commentCount: 2,
          isLiked: true,
          canInteract: true,
        }}
      />,
    );

    const likeButton = screen.getByRole("button", { name: "좋아요 취소" });
    expect((likeButton as HTMLButtonElement).disabled).toBe(false);
    expect(likeButton.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          input.toString().endsWith("/server-state-card/engagement"),
        ),
      ).toBe(false),
    );
  });

  it("uses the per-tab student marker while preserving an explicit prop override", async () => {
    document.body.innerHTML =
      '<header data-aura-board-id="board-marker" data-aura-student-viewer="true"></header>';
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(
          response({
            likeCount: 0,
            commentCount: 0,
            isLiked: false,
            canInteract: true,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<CardEngagement cardId="marker-card" mode="chips" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const markerRequest = fetchMock.mock.calls.find(([input]) =>
      input.toString().endsWith("/marker-card/engagement"),
    );
    expect(markerRequest?.[1]?.headers).toMatchObject({
      "x-aura-student-viewer": "1",
    });
    expect(engagementHookMock).toHaveBeenCalledWith(
      "board-marker",
      "marker-card",
      expect.any(Function),
    );
    first.unmount();

    fetchMock.mockClear();
    render(
      <CardEngagement
        cardId="teacher-card"
        boardId="board-explicit"
        isStudentViewer={false}
        mode="chips"
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const explicitRequest = fetchMock.mock.calls.find(([input]) =>
      input.toString().endsWith("/teacher-card/engagement"),
    );
    expect(explicitRequest?.[1]?.headers).toEqual({});
  });

  it("ignores like events and coalesces comment events with a trailing load", async () => {
    const secondComments = deferred<JsonResponse>();
    let commentsRequestCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/engagement")) {
        return Promise.resolve(
          response({
            likeCount: 0,
            commentCount: 1,
            isLiked: false,
            canInteract: true,
          }),
        );
      }
      if (url.endsWith("/comments?audience=public")) {
        commentsRequestCount += 1;
        if (commentsRequestCount === 1) {
          return Promise.resolve(
            response({
              items: [
                {
                  id: "comment-1",
                  content: "첫 댓글",
                  createdAt: "2026-07-10T00:00:00.000Z",
                  authorKind: "teacher",
                  authorLabel: "선생님",
                  canDelete: false,
                },
              ],
            }),
          );
        }
        if (commentsRequestCount === 2) return secondComments.promise;
        return Promise.resolve(
          response({
            items: [
              {
                id: "comment-3",
                content: "최종 댓글",
                createdAt: "2026-07-10T00:00:02.000Z",
                authorKind: "student",
                authorLabel: "학생",
                canDelete: false,
              },
            ],
          }),
        );
      }
      return Promise.resolve(response({}, false));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardEngagement cardId="card-live" boardId="board-a" mode="panel" />,
    );

    await screen.findByText("첫 댓글");
    expect(commentsRequestCount).toBe(1);

    const emit = (changeType?: "like" | "comment") => {
      const event: BoardEngagementEvent = {
        type: "engagement_changed",
        boardId: "board-a",
        cardId: "card-live",
        likeCount: changeType === "like" ? 1 : 0,
        commentCount: 2,
        ...(changeType ? { changeType } : {}),
        updatedAt: "2026-07-10T00:00:01.000Z",
      };
      for (const call of engagementHookMock.mock.calls.slice(-2)) {
        (call[2] as (payload: BoardEngagementEvent) => void)(event);
      }
    };

    act(() => emit("like"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(commentsRequestCount).toBe(1);

    act(() => emit("comment"));
    await waitFor(() => expect(commentsRequestCount).toBe(2));
    act(() => emit());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(commentsRequestCount).toBe(2);

    secondComments.resolve(
      response({
        items: [
          {
            id: "comment-2",
            content: "중간 댓글",
            createdAt: "2026-07-10T00:00:01.000Z",
            authorKind: "student",
            authorLabel: "학생",
            canDelete: false,
          },
        ],
      }),
    );

    await waitFor(() => expect(commentsRequestCount).toBe(3));
    await screen.findByText("최종 댓글");
  });

  it("shows eligible conversation tabs and sends the selected audience", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/poll")) {
        return Promise.resolve(response({ enabled: false }));
      }
      if (url.endsWith("/comments?audience=public")) {
        return Promise.resolve(
          response({
            guardianAvailable: true,
            items: [
              {
                id: "public-comment",
                content: "공개 댓글",
                createdAt: "2026-07-10T00:00:00.000Z",
                authorKind: "teacher",
                authorLabel: "선생님",
                canDelete: false,
              },
            ],
          }),
        );
      }
      if (url.endsWith("/comments?audience=guardian")) {
        return Promise.resolve(
          response({
            guardianAvailable: true,
            items: [
              {
                id: "guardian-comment",
                content: "보호자 댓글",
                createdAt: "2026-07-10T00:00:01.000Z",
                authorKind: "teacher",
                authorLabel: "선생님",
                canDelete: false,
              },
            ],
          }),
        );
      }
      if (url.endsWith("/comments") && init?.method === "POST") {
        return Promise.resolve(
          response({
            item: {
              id: "new-guardian-comment",
              content: "비공개 답글",
              createdAt: "2026-07-10T00:00:02.000Z",
              authorKind: "teacher",
              authorLabel: "선생님",
              canDelete: true,
            },
          }),
        );
      }
      return Promise.resolve(response({}, false));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardEngagement
        cardId="guardian-tabs-card"
        boardId="board-tabs"
        mode="panel"
        initialCounts={{
          likeCount: 0,
          commentCount: 1,
          isLiked: false,
          canInteract: true,
        }}
      />,
    );

    await screen.findByText("공개 댓글");
    const publicTab = screen.getByRole("tab", { name: "공개 대화" });
    const guardianTab = screen.getByRole("tab", { name: "보호자 대화" });
    expect(publicTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(publicTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(guardianTab);
    await screen.findByText("보호자 댓글");

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "비공개 답글" } });
    fireEvent.submit(textbox.closest("form")!);

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([input, init]) =>
          input.toString().endsWith("/comments") && init?.method === "POST",
      );
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        content: "비공개 답글",
        audience: "guardian",
      });
    });
  });

  it("keeps a parent on the guardian writer and makes public comments read-only", async () => {
    document.body.innerHTML = '<header class="parent-topnav"></header>';
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/poll")) {
        return Promise.resolve(response({ enabled: false }));
      }
      if (url.endsWith("/comments?audience=guardian")) {
        return Promise.resolve(
          response({ guardianAvailable: true, items: [] }),
        );
      }
      if (url.endsWith("/comments?audience=public")) {
        return Promise.resolve(
          response({ guardianAvailable: true, items: [] }),
        );
      }
      return Promise.resolve(response({}, false));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardEngagement
        cardId="parent-card"
        boardId="parent-board"
        mode="panel"
        initialCounts={{
          likeCount: 0,
          commentCount: 0,
          isLiked: false,
          canInteract: true,
        }}
      />,
    );

    const guardianTab = await screen.findByRole("tab", { name: "보호자 대화" });
    expect(guardianTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("textbox")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "공개 대화" }));
    await screen.findByText("읽기 전용이라 댓글을 달 수 없어요");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not render guardian controls when the API denies availability", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/poll")) {
        return Promise.resolve(response({ enabled: false }));
      }
      if (url.endsWith("/comments?audience=public")) {
        return Promise.resolve(
          response({ guardianAvailable: false, items: [] }),
        );
      }
      return Promise.resolve(response({}, false));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardEngagement
        cardId="public-only-card"
        mode="panel"
        initialCounts={{
          likeCount: 0,
          commentCount: 0,
          isLiked: false,
          canInteract: true,
        }}
      />,
    );

    await screen.findByText("아직 댓글이 없어요");
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
