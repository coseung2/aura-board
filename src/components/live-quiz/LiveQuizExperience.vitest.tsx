import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveQuizStateResponse } from "@/lib/live-quiz/contracts";
import { LiveQuizExperience } from "./LiveQuizExperience";

const realtimeClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/live-quiz/realtime-client", () => ({
  getLiveQuizRealtimeClient: realtimeClientMock,
}));

vi.mock("./LiveQuizLivePanel", () => ({
  LiveQuizLivePanel: ({ state }: { state: LiveQuizStateResponse | null }) => (
    <output data-testid="live-state">
      {state
        ? `${state.sessionKey}:${state.question?.id ?? "none"}:${state.activeAnswerCount}`
        : "loading"}
    </output>
  ),
}));

vi.mock("./LiveQuizSuggestionPanel", () => ({
  LiveQuizSuggestionPanel: () => <div>suggestions</div>,
}));

type CounterRow = {
  sessionKey: string;
  questionId: string;
  shard: number;
  answerCount: number;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function liveState(input: {
  sessionKey?: string;
  questionId?: string;
  answerCount?: number;
} = {}): LiveQuizStateResponse {
  const sessionKey = input.sessionKey ?? "2099-08-06";
  return {
    phase: "live",
    serverNow: "2099-08-06T04:30:00.000Z",
    sessionKey,
    startsAt: "2099-08-06T04:30:00.000Z",
    endsAt: "2099-08-06T04:34:10.000Z",
    nextStartsAt: "2099-08-06T04:30:00.000Z",
    questionCount: 10,
    score: 0,
    answeredCount: 0,
    questionNumber: 1,
    stage: "answer",
    stageEndsAt: "2099-08-06T04:30:20.000Z",
    question: {
      id: input.questionId ?? "question-1",
      prompt: "Question",
      choices: ["A", "B", "C", "D"],
      category: null,
    },
    selectedChoice: null,
    correctChoice: null,
    isCorrect: null,
    explanation: null,
    activeAnswerCount: input.answerCount ?? 100,
    setupReason: null,
  };
}

function response(body: LiveQuizStateResponse): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function createRealtimeHarness() {
  const order: string[] = [];
  const snapshotQueue: Array<Promise<{ data: CounterRow[]; error: null }>> = [];
  const channels: Array<{
    callbacks: Map<string, (payload: { new: unknown }) => void>;
    status: ((status: string) => void) | null;
    removed: boolean;
  }> = [];
  const client = {
    channel: vi.fn(() => {
      const record = {
        callbacks: new Map<string, (payload: { new: unknown }) => void>(),
        status: null as ((status: string) => void) | null,
        removed: false,
      };
      const channel = {
        on: vi.fn(
          (
            _kind: string,
            filter: { table: string },
            callback: (payload: { new: unknown }) => void,
          ) => {
            record.callbacks.set(filter.table, callback);
            return channel;
          },
        ),
        subscribe: vi.fn((callback: (status: string) => void) => {
          order.push("subscribe");
          record.status = callback;
          return channel;
        }),
      };
      channels.push(record);
      return channel;
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          order.push("snapshot");
          const next = snapshotQueue.shift();
          if (!next) throw new Error("missing_snapshot_result");
          return next;
        }),
      })),
    })),
    removeChannel: vi.fn(async (channel: unknown) => {
      const index = client.channel.mock.results.findIndex(
        (result) => result.value === channel,
      );
      if (index >= 0) channels[index].removed = true;
    }),
  };
  return { channels, client, order, snapshotQueue };
}

function emitCounter(
  channel: ReturnType<typeof createRealtimeHarness>["channels"][number],
  row: CounterRow,
) {
  channel.callbacks.get("LiveQuizQuestionCounterShard")?.({ new: row });
}

function emitPublicSession(
  channel: ReturnType<typeof createRealtimeHarness>["channels"][number],
) {
  channel.callbacks.get("LiveQuizPublicSession")?.({ new: {} });
}

describe("LiveQuizExperience Realtime lifecycle", () => {
  const rafCallbacks = new Map<number, FrameRequestCallback>();
  let nextRafId = 1;

  beforeEach(() => {
    realtimeClientMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    rafCallbacks.clear();
    nextRafId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      rafCallbacks.delete(id);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushAnimationFrames() {
    const pending = [...rafCallbacks.entries()];
    rafCallbacks.clear();
    for (const [, callback] of pending) callback(performance.now());
  }

  it("subscribes before seeding and max-merges an event ahead of a stale snapshot", async () => {
    const realtime = createRealtimeHarness();
    const snapshot = deferred<{ data: CounterRow[]; error: null }>();
    realtime.snapshotQueue.push(snapshot.promise);
    realtimeClientMock.mockReturnValue(realtime.client);
    vi.mocked(fetch).mockResolvedValue(response(liveState()));

    render(
      <LiveQuizExperience viewerKind="student" displayName="Student" />,
    );
    await screen.findByText("2099-08-06:question-1:100");
    await waitFor(() => expect(realtime.channels).toHaveLength(1));

    act(() => realtime.channels[0].status?.("SUBSCRIBED"));
    expect(realtime.order).toEqual(["subscribe", "snapshot"]);
    act(() => {
      emitCounter(realtime.channels[0], {
        sessionKey: "2099-08-06",
        questionId: "question-1",
        shard: 9,
        answerCount: 61,
      });
    });
    expect(rafCallbacks.size).toBe(1);

    await act(async () => {
      snapshot.resolve({
        data: [
          {
            sessionKey: "2099-08-06",
            questionId: "question-1",
            shard: 3,
            answerCount: 40,
          },
          {
            sessionKey: "2099-08-06",
            questionId: "question-1",
            shard: 9,
            answerCount: 60,
          },
        ],
        error: null,
      });
      await snapshot.promise;
    });
    act(flushAnimationFrames);
    expect(screen.getByTestId("live-state").textContent).toBe(
      "2099-08-06:question-1:101",
    );
  });

  it("handles overlapping reconnect snapshots without moving a shard backward", async () => {
    const realtime = createRealtimeHarness();
    const first = deferred<{ data: CounterRow[]; error: null }>();
    const reconnect = deferred<{ data: CounterRow[]; error: null }>();
    realtime.snapshotQueue.push(first.promise, reconnect.promise);
    realtimeClientMock.mockReturnValue(realtime.client);
    vi.mocked(fetch).mockResolvedValue(response(liveState()));

    render(
      <LiveQuizExperience viewerKind="student" displayName="Student" />,
    );
    await screen.findByText("2099-08-06:question-1:100");
    await waitFor(() => expect(realtime.channels).toHaveLength(1));
    act(() => {
      realtime.channels[0].status?.("SUBSCRIBED");
      realtime.channels[0].status?.("CHANNEL_ERROR");
      realtime.channels[0].status?.("SUBSCRIBED");
      emitCounter(realtime.channels[0], {
        sessionKey: "2099-08-06",
        questionId: "question-1",
        shard: 9,
        answerCount: 61,
      });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      reconnect.resolve({
        data: [
          { sessionKey: "2099-08-06", questionId: "question-1", shard: 3, answerCount: 40 },
          { sessionKey: "2099-08-06", questionId: "question-1", shard: 9, answerCount: 60 },
        ],
        error: null,
      });
      first.resolve({
        data: [
          { sessionKey: "2099-08-06", questionId: "question-1", shard: 3, answerCount: 40 },
          { sessionKey: "2099-08-06", questionId: "question-1", shard: 9, answerCount: 59 },
        ],
        error: null,
      });
      await Promise.all([first.promise, reconnect.promise]);
    });
    act(flushAnimationFrames);
    expect(screen.getByTestId("live-state").textContent).toBe(
      "2099-08-06:question-1:101",
    );
  });

  it("replaces sessions safely and cancels a pending RAF on unmount", async () => {
    const realtime = createRealtimeHarness();
    realtime.snapshotQueue.push(
      Promise.resolve({ data: [], error: null }),
      Promise.resolve({ data: [], error: null }),
    );
    realtimeClientMock.mockReturnValue(realtime.client);
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(liveState()))
      .mockResolvedValueOnce(
        response(
          liveState({
            sessionKey: "2099-08-07",
            questionId: "question-2",
            answerCount: 4,
          }),
        ),
      )
      .mockResolvedValueOnce(
        response(
          liveState({
            sessionKey: "2099-08-07",
            questionId: "question-3",
            answerCount: 7,
          }),
        ),
      );

    const view = render(
      <LiveQuizExperience viewerKind="student" displayName="Student" />,
    );
    await screen.findByText("2099-08-06:question-1:100");
    await waitFor(() => expect(realtime.channels).toHaveLength(1));
    act(() => emitPublicSession(realtime.channels[0]));
    await screen.findByText("2099-08-07:question-2:4");
    await waitFor(() => expect(realtime.channels).toHaveLength(2));
    expect(realtime.channels[0].removed).toBe(true);

    act(() => {
      emitCounter(realtime.channels[0], {
        sessionKey: "2099-08-06",
        questionId: "question-1",
        shard: 1,
        answerCount: 999,
      });
      emitCounter(realtime.channels[1], {
        sessionKey: "2099-08-07",
        questionId: "question-2",
        shard: 1,
        answerCount: 5,
      });
    });
    expect(rafCallbacks.size).toBe(1);
    act(flushAnimationFrames);
    expect(screen.getByTestId("live-state").textContent).toBe(
      "2099-08-07:question-2:5",
    );

    act(() => {
      emitPublicSession(realtime.channels[1]);
    });
    await screen.findByText("2099-08-07:question-3:7");
    expect(realtime.channels).toHaveLength(2);

    act(() => {
      emitCounter(realtime.channels[1], {
        sessionKey: "2099-08-07",
        questionId: "question-2",
        shard: 1,
        answerCount: 999,
      });
      emitCounter(realtime.channels[1], {
        sessionKey: "2099-08-07",
        questionId: "question-3",
        shard: 1,
        answerCount: 8,
      });
    });
    act(flushAnimationFrames);
    expect(screen.getByTestId("live-state").textContent).toBe(
      "2099-08-07:question-3:8",
    );

    act(() => {
      emitCounter(realtime.channels[1], {
        sessionKey: "2099-08-07",
        questionId: "question-3",
        shard: 1,
        answerCount: 9,
      });
    });
    expect(rafCallbacks.size).toBe(1);
    view.unmount();
    expect(rafCallbacks.size).toBe(0);
    expect(realtime.channels[1].removed).toBe(true);
  });
});
