vi.mock("../../../apps/mobile/node_modules/react-native", () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));
vi.mock("../../../apps/mobile/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const realtime = await import("../../../apps/mobile/lib/use-board-realtime");

type BoardRealtimeChannel = {
  on: (
    type: "broadcast",
    options: { event: string },
    callback: () => void,
  ) => unknown;
  subscribe: (callback?: (status: string) => void) => unknown;
};
type BoardRealtimeClient = {
  channel: (name: string) => BoardRealtimeChannel;
  removeChannel: (channel: BoardRealtimeChannel) => Promise<unknown> | unknown;
};

function fakeClient() {
  let statusCallback: ((status: string) => void) | undefined;
  const eventCallbacks = new Map<string, () => void>();
  const channel: BoardRealtimeChannel = {
    on: vi.fn((_type, options, callback) => {
      eventCallbacks.set(options.event, callback);
      return channel;
    }),
    subscribe: vi.fn((callback) => {
      statusCallback = callback;
      return channel;
    }),
  };
  const client: BoardRealtimeClient = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve("ok")),
  };
  return {
    client,
    channel,
    emitStatus: (status: string) => statusCallback?.(status),
    emitEvent: (event: string) => eventCallbacks.get(event)?.(),
  };
}

describe("mobile board realtime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one board channel and removes it once after the final subscriber", async () => {
    const fake = fakeClient();
    const registry = realtime.createBoardRealtimeRegistry(fake.client);
    const first = {
      onEvent: vi.fn(),
      onStatus: vi.fn(),
    };
    const second = {
      onEvent: vi.fn(),
      onStatus: vi.fn(),
    };

    const firstSubscription = registry.subscribe("board-1", first);
    const secondSubscription = registry.subscribe("board-1", second);
    expect(firstSubscription.status).toBe("connecting");
    expect(secondSubscription.status).toBe("connecting");
    expect(fake.client.channel).toHaveBeenCalledTimes(1);
    expect(registry.getEntryCount()).toBe(1);

    firstSubscription.unsubscribe();
    await Promise.resolve();
    expect(fake.client.removeChannel).not.toHaveBeenCalled();
    secondSubscription.unsubscribe();
    await Promise.resolve();
    expect(fake.client.removeChannel).toHaveBeenCalledTimes(1);
    secondSubscription.unsubscribe();
    expect(fake.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(registry.getEntryCount()).toBe(0);
  });

  it("coalesces bursts with a trailing debounce and queues one refresh behind an in-flight request", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reload = vi.fn(() => pending);
    const runner = realtime.createReloadRunner(reload);

    runner.reload();
    runner.reload();
    await vi.advanceTimersByTimeAsync(realtime.BOARD_REALTIME_DEBOUNCE_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);

    runner.reload();
    await vi.advanceTimersByTimeAsync(realtime.BOARD_REALTIME_DEBOUNCE_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    release();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(2);
    runner.dispose();
  });

  it("does not reload just because the channel reports SUBSCRIBED", () => {
    const fake = fakeClient();
    const registry = realtime.createBoardRealtimeRegistry(fake.client);
    const reload = vi.fn();
    const subscriber = {
      onEvent: reload,
      onStatus: vi.fn(),
    };
    registry.subscribe("board-1", subscriber);

    fake.emitStatus("SUBSCRIBED");

    expect(subscriber.onStatus).toHaveBeenLastCalledWith("subscribed");
    expect(reload).not.toHaveBeenCalled();
  });

  it("uses fallback polling for every status except a healthy subscription", () => {
    expect(realtime.shouldUseBoardFallbackPolling("idle")).toBe(true);
    expect(realtime.shouldUseBoardFallbackPolling("connecting")).toBe(true);
    expect(realtime.shouldUseBoardFallbackPolling("error")).toBe(true);
    expect(realtime.shouldUseBoardFallbackPolling("unavailable")).toBe(true);
    expect(realtime.shouldUseBoardFallbackPolling("subscribed")).toBe(false);
  });
});
