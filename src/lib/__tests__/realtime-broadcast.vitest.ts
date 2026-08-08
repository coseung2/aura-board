import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classroomMorningChannelKey } from "../realtime";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  channel: vi.fn(),
  httpSend: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseMocks.createClient,
}));

function configureClient() {
  const channel = { httpSend: supabaseMocks.httpSend };
  supabaseMocks.channel.mockReturnValue(channel);
  supabaseMocks.httpSend.mockResolvedValue({ success: true });
  supabaseMocks.removeChannel.mockResolvedValue("ok");
  supabaseMocks.createClient.mockReturnValue({
    channel: supabaseMocks.channel,
    removeChannel: supabaseMocks.removeChannel,
  });
  return channel;
}

describe("server realtime broadcasts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends engagement change types over bounded HTTP and cleans up", async () => {
    const channel = configureClient();
    const { announceEngagementChange } = await import("../realtime-broadcast");

    await announceEngagementChange("board-1", "card-1", 3, 2, "like");

    expect(supabaseMocks.channel).toHaveBeenCalledWith("board:board-1");
    expect(supabaseMocks.httpSend).toHaveBeenCalledWith(
      "board_changed",
      expect.objectContaining({
        type: "engagement_changed",
        boardId: "board-1",
        cardId: "card-1",
        likeCount: 3,
        commentCount: 2,
        changeType: "like",
      }),
      { timeout: 1500 },
    );
    expect(supabaseMocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("publishes the classroom morning contract", async () => {
    const channel = configureClient();
    const { announceClassroomMorningChange } = await import(
      "../realtime-broadcast"
    );

    await announceClassroomMorningChange(
      "classroom-1",
      "cleaning_inspection",
      "2026-07-10",
    );

    expect(classroomMorningChannelKey("classroom-1")).toBe(
      "classroom:classroom-1:morning",
    );
    expect(supabaseMocks.httpSend).toHaveBeenCalledWith(
      "morning_changed",
      expect.objectContaining({
        type: "morning_changed",
        classroomId: "classroom-1",
        changeType: "cleaning_inspection",
        date: "2026-07-10",
      }),
      { timeout: 1500 },
    );
    expect(supabaseMocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("retries a transient HTTP result and cleans up every attempt", async () => {
    vi.useFakeTimers();
    const channel = configureClient();
    supabaseMocks.httpSend
      .mockResolvedValueOnce({ success: false, status: 503, error: "unavailable" })
      .mockResolvedValueOnce({ success: true });
    const { announceCardChange } = await import("../realtime-broadcast");

    const request = announceCardChange("board-1", "update");
    await vi.runAllTimersAsync();
    await expect(request).resolves.toBeUndefined();

    expect(supabaseMocks.httpSend).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.removeChannel).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.removeChannel).toHaveBeenNthCalledWith(1, channel);
    expect(supabaseMocks.removeChannel).toHaveBeenNthCalledWith(2, channel);
  });

  it("contains a persistent network failure after three attempts", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    const channel = configureClient();
    const deliveryError = new Error("Bad Gateway");
    supabaseMocks.httpSend.mockRejectedValue(deliveryError);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { announceCardChange } = await import("../realtime-broadcast");

    const request = announceCardChange("board-1", "update");
    await vi.runAllTimersAsync();
    await expect(request).resolves.toBeUndefined();

    expect(supabaseMocks.httpSend).toHaveBeenCalledTimes(3);
    expect(supabaseMocks.removeChannel).toHaveBeenCalledTimes(3);
    expect(supabaseMocks.removeChannel).toHaveBeenLastCalledWith(channel);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[realtime broadcast] delivery failed",
      deliveryError,
    );
  });

  it("does not retry a non-transient HTTP 400 result", async () => {
    configureClient();
    supabaseMocks.httpSend.mockResolvedValueOnce({
      success: false,
      status: 400,
      error: "invalid payload",
    });
    const { announceCardChange } = await import("../realtime-broadcast");

    await expect(announceCardChange("board-1", "update")).resolves.toBeUndefined();

    expect(supabaseMocks.httpSend).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("swallows client initialization failures", async () => {
    supabaseMocks.createClient.mockImplementationOnce(() => {
      throw new Error("invalid URL");
    });
    const { announceClassroomMorningChange } = await import(
      "../realtime-broadcast"
    );

    await expect(
      announceClassroomMorningChange(
        "classroom-1",
        "yellow_card",
        "2026-07-10",
      ),
    ).resolves.toBeUndefined();
    expect(supabaseMocks.removeChannel).not.toHaveBeenCalled();
  });

  it("delivers validated legacy events as invalidation-only payloads", async () => {
    configureClient();
    const { publishValidatedRealtimeEvent } = await import("../realtime-broadcast");

    await publishValidatedRealtimeEvent({
      channel: "board:board-1:assignment",
      type: "reminder.issued",
      payload: {
        boardId: "board-1",
        studentIds: ["student-secret"],
        issuedAt: "2026-07-31T00:00:00.000Z",
      },
    });

    expect(supabaseMocks.httpSend).toHaveBeenCalledWith(
      "reminder.issued",
      { type: "reminder.issued" },
      { timeout: 1500 },
    );
  });

  it("rejects a legacy event whose channel does not match its contract", async () => {
    configureClient();
    const { publishValidatedRealtimeEvent } = await import("../realtime-broadcast");

    await expect(
      publishValidatedRealtimeEvent({
        channel: "board:board-1:vibe-arcade",
        type: "reminder.issued",
        payload: {
          boardId: "board-1",
          studentIds: [],
          issuedAt: "2026-07-31T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("Channel does not match reminder.issued");
    expect(supabaseMocks.httpSend).not.toHaveBeenCalled();
  });

  it("does not treat an HTTP error result as successful delivery", async () => {
    configureClient();
    supabaseMocks.httpSend.mockResolvedValueOnce({
      success: false,
      status: 503,
      error: "unavailable",
    });
    const { sendRealtimeBroadcast } = await import("../realtime-broadcast");

    await expect(
      sendRealtimeBroadcast("board:board-1:assignment", "slot.updated", {
        type: "slot.updated",
      }),
    ).rejects.toThrow("broadcast failed (503)");
  });

  it("fails truthfully when server configuration is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { publishValidatedRealtimeEvent, RealtimeConfigurationError } = await import(
      "../realtime-broadcast"
    );

    await expect(
      publishValidatedRealtimeEvent({
        channel: "board:board-1:assignment",
        type: "slot.updated",
        payload: {
          slotId: "slot-1",
          submissionStatus: "submitted",
          gradingStatus: "not_graded",
          updatedAt: "2026-07-31T00:00:00.000Z",
        },
      }),
    ).rejects.toBeInstanceOf(RealtimeConfigurationError);
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps speed-game broadcasts invalidation-only", async () => {
    configureClient();
    const { announceSpeedGameChange } = await import("../realtime-broadcast");

    await announceSpeedGameChange("game-1", "answer");

    expect(supabaseMocks.httpSend).toHaveBeenCalledWith(
      "speed_game_changed",
      { type: "speed_game_changed" },
      { timeout: 1500 },
    );
  });
});
