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

  it("swallows HTTP delivery failures and still cleans up", async () => {
    const channel = configureClient();
    supabaseMocks.httpSend.mockRejectedValueOnce(new Error("timed out"));
    const { announceCardChange } = await import("../realtime-broadcast");

    await expect(announceCardChange("board-1", "update")).resolves.toBeUndefined();

    expect(supabaseMocks.removeChannel).toHaveBeenCalledWith(channel);
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
});
