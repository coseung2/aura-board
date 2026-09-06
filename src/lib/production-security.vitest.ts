import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  student: vi.fn(), user: vi.fn(), board: vi.fn(), member: vi.fn(),
  project: vi.fn(), config: vi.fn(), slots: vi.fn(), session: vi.fn(), create: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  board: { findFirst: mocks.board }, boardMember: { findUnique: mocks.member },
  vibeProject: { findFirst: mocks.project, create: mocks.create }, vibeArcadeConfig: { findUnique: mocks.config },
  agentSession: { findUnique: mocks.session },
  assignmentSlot: { findMany: mocks.slots },
} }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.student }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));

import { POST as retiredSignup } from "@/app/api/parent/signup/route";
import { GET as retiredCallback } from "@/app/parent/auth/callback/route";
import { loadAuthorizedVibeProject } from "./vibe-arcade/project-access";
import { loadStudentAssignmentSlots } from "./student-assignment-payload";
import { getCurrentAgentStudent } from "./agent/access";
import { POST as saveAgent } from "@/app/api/agent/sessions/[id]/save/route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AURA_ADMIN_EMAILS", "normal@example.com");
  mocks.user.mockResolvedValue(null);
  mocks.student.mockResolvedValue({ id: "me", classroomId: "class", classroom: { teacher: { email: "normal@example.com" } } });
  mocks.board.mockResolvedValue({ id: "board", classroomId: "class", anonymousAuthor: false });
  mocks.member.mockResolvedValue(null);
  mocks.project.mockResolvedValue({ id: "project", authorStudentId: "peer", moderationStatus: "approved", author: { name: "작가" }, reviews: [] });
  mocks.config.mockResolvedValue({ enabled: true, reviewAuthorDisplay: "named" });
});
afterEach(() => vi.unstubAllEnvs());

describe("retired parent magic-link authentication", () => {
  it.each(["true", "false"])("never issues links/sessions even when email flag is %s", async (value) => {
    vi.stubEnv("PARENT_EMAIL_ENABLED", value);
    for (const handle of [retiredSignup, retiredCallback]) {
      const response = await handle();
      expect(response.status).toBe(410);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json();
      expect(body.error).toBe("magic_link_retired");
      expect(body).not.toHaveProperty("devMagicLinkUrl");
      expect(body).not.toHaveProperty("token");
    }
    expect(mocks.student).not.toHaveBeenCalled();
  });
});

describe("project detail/play scope", () => {
  it("denies anonymous before looking up a project", async () => {
    mocks.student.mockResolvedValue(null);
    expect(await loadAuthorizedVibeProject("board", "project")).toBeNull();
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it("denies foreign classroom students", async () => {
    mocks.student.mockResolvedValue({ id: "foreign", classroomId: "other", classroom: { teacher: { email: "normal@example.com" } } });
    expect(await loadAuthorizedVibeProject("board", "project")).toBeNull();
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it("binds the project lookup to the actual board and classroom", async () => {
    expect(await loadAuthorizedVibeProject("slug", "project")).not.toBeNull();
    expect(mocks.project.mock.calls[0][0].where).toEqual({ id: "project", boardId: "board", classroomId: "class" });
  });
  it.each(["draft", "rejected", "pending_review"])("denies peers for %s", async (status) => {
    mocks.project.mockResolvedValue({ authorStudentId: "peer", moderationStatus: status, reviews: [] });
    expect(await loadAuthorizedVibeProject("board", "project")).toBeNull();
  });
  it("denies peers while the classroom feature is closed", async () => {
    mocks.config.mockResolvedValue({ enabled: false });
    expect(await loadAuthorizedVibeProject("board", "project")).toBeNull();
  });
  it("keeps author preview but not reviews for an unapproved draft", async () => {
    mocks.project.mockResolvedValue({ authorStudentId: "me", moderationStatus: "draft", author: { name: "나" }, reviews: [] });
    const access = await loadAuthorizedVibeProject("board", "project");
    expect(access).not.toBeNull();
    expect(access?.canReview).toBe(false);
  });
  it("allows a board manager to inspect drafts", async () => {
    mocks.user.mockResolvedValue({ id: "teacher", email: "normal@example.com" });
    mocks.student.mockResolvedValue(null);
    mocks.member.mockResolvedValue({ role: "owner" });
    mocks.project.mockResolvedValue({ authorStudentId: "peer", moderationStatus: "draft", author: { name: "학생" }, reviews: [] });
    expect(await loadAuthorizedVibeProject("board", "project")).not.toBeNull();
  });
});

describe("student assignment DTO", () => {
  it("queries peers only as summaries and keeps the current submission", async () => {
    const own = {
      id: "own", studentId: "me", slotNumber: 2, submissionStatus: "submitted",
      card: { id: "own-card", title: "과제", imageUrl: "own-image" },
      student: { id: "me", name: "나", number: 2 },
      submission: { id: "submission", content: "내 내용", createdAt: new Date("2026-01-01"), fileUrl: "own-file", linkUrl: null },
    };
    mocks.slots.mockResolvedValueOnce([own]).mockResolvedValueOnce([
      { id: "peer", studentId: "peer", slotNumber: 1, submissionStatus: "submitted", student: { id: "peer", name: "친구", number: 1 }, returnReason: "must not leak", submission: { content: "secret" } },
    ]);
    const slots = await loadStudentAssignmentSlots("board", "me");
    expect(mocks.slots.mock.calls[0][0].where).toEqual({ boardId: "board", studentId: "me" });
    expect(mocks.slots.mock.calls[1][0].select).not.toHaveProperty("submission");
    expect(mocks.slots.mock.calls[1][0].select).not.toHaveProperty("card");
    expect(JSON.stringify(slots[0])).not.toMatch(/secret|must not leak/);
    expect(slots[0].submission).toBeNull();
    expect(slots[1].submission?.content).toBe("내 내용");
    expect(slots[1].submission?.imageUrl).toBe("own-image");
  });
});

describe("Agent save destination", () => {
  it("denies a destination outside the student's classroom before writing", async () => {
    vi.stubEnv("AURA_ADMIN_EMAILS", "normal@example.com");
    mocks.session.mockResolvedValue({ id: "session", studentId: "me", classroomId: "class", messages: [] });
    mocks.board.mockResolvedValue(null);
    const response = await saveAgent(new Request("http://localhost/api/agent/sessions/session/save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId: "foreign-board", title: "작품" }),
    }), { params: Promise.resolve({ id: "session" }) });
    expect(response.status).toBe(403);
    expect(mocks.board.mock.calls[0][0].where).toEqual({ id: "foreign-board", classroomId: "class" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("Agent experiment access", () => {
  it("denies a normal classroom", async () => {
    vi.stubEnv("AURA_ADMIN_EMAILS", "admin@example.com");
    expect(await getCurrentAgentStudent()).toBeNull();
  });
  it("honors the configured admin classroom", async () => {
    vi.stubEnv("AURA_ADMIN_EMAILS", "normal@example.com");
    expect((await getCurrentAgentStudent())?.id).toBe("me");
  });
});
