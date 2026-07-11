import { act, render, screen, waitFor } from "@testing-library/react";
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
      if (url.endsWith("/comments")) {
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
});
