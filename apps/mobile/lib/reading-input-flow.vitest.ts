import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the existing model's state transitions without mounting native UI.
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, push: vi.fn(), replace: vi.fn(), api: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? initial() : initial;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = typeof next === "function" ? next(harness.slots[index]) : next; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useEffect: () => undefined,
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: harness.push, replace: harness.replace }) }));
vi.mock("react-native", () => ({ useWindowDimensions: () => ({ width: 1280, height: 800 }) }));
vi.mock("../components/ui", () => ({ TextField: "TextField" }));
vi.mock("./api", () => ({ apiFetch: harness.api, ApiError: class extends Error { status = 500; } }));
vi.mock("./session", () => ({ clearSessionToken: vi.fn(), getUnifiedLoginRoute: () => "/login?role=student" }));
vi.mock("./student-attendance", () => ({ claimStudentAttendanceReward: vi.fn() }));
vi.mock("./titles", () => ({ claimTitle: vi.fn() }));
vi.mock("./walking-health", () => ({ fetchWalkingSnapshot: vi.fn() }));

import { useStudentReadingScreenModel } from "../screens/student/use-student-reading-screen-model";

function render() { harness.cursor = 0; return useStudentReadingScreenModel(); }
const savedEntry = {
  id: "entry-1", bookType: "story" as const, title: "기존 책", author: "작가", reflection: "기존 감상", createdAt: "2026-09-11T00:00:00Z",
  aiScore: null, aiFeedback: null, aiFeedbackStatus: "pending" as const, aiFeedbackModel: null, aiFeedbackError: null, evaluatedAt: null,
};
function enterDraft() {
  const model = render();
  model.setTitle("작성 중인 책"); model.setAuthor("지은이"); model.setReflection("아직 작성 중인 감상");
  return render();
}

describe("reading native input flow", () => {
  beforeEach(() => { harness.slots = []; harness.cursor = 0; vi.clearAllMocks(); harness.api.mockReset(); });
  it("preserves the new draft when reopening its native route", () => {
    enterDraft().openComposer();
    expect(harness.push).toHaveBeenCalledWith("/(student)/reading/compose");
    expect(render()).toMatchObject({ title: "작성 중인 책", reflection: "아직 작성 중인 감상" });
  });
  it("does not turn an edited existing record into a new-record draft", () => {
    enterDraft().openEditor(savedEntry);
    expect(render().title).toBe("기존 책");
    render().setTitle("수정 중인 책");
    render().openComposer();
    expect(render()).toMatchObject({ title: "작성 중인 책", editingEntryId: null });
  });
  it("keeps values on failure and only signals success after persistence", async () => {
    harness.api.mockRejectedValueOnce(new Error("offline"));
    expect(await enterDraft().save()).toBe(false);
    expect(render()).toMatchObject({ title: "작성 중인 책", saving: false });
    expect(harness.push).not.toHaveBeenCalled();
  });
  it("uses PATCH for editing, retains the separate new draft and resumes feedback", async () => {
    enterDraft().openEditor(savedEntry);
    harness.api.mockResolvedValueOnce({ entry: savedEntry }).mockResolvedValue({ evaluation: { aiFeedbackStatus: "failed" } });
    expect(await render().save()).toBe(true);
    expect(harness.api).toHaveBeenCalledWith("/api/student/reading/entry-1", expect.objectContaining({ method: "PATCH" }));
    expect(harness.api).toHaveBeenCalledWith("/api/student/reading/entry-1/feedback", expect.objectContaining({ method: "POST", json: { forceReevaluation: true, reflection: savedEntry.reflection } }));
    expect(render()).toMatchObject({ title: "작성 중인 책", editingEntryId: null });
  });
  it("clears a newly saved draft and uses POST only once", async () => {
    harness.api.mockResolvedValueOnce({ entry: savedEntry }).mockResolvedValue({ evaluation: { aiFeedbackStatus: "failed" } });
    expect(await enterDraft().save()).toBe(true);
    expect(render()).toMatchObject({ title: "", author: "", reflection: "" });
    expect(harness.api.mock.calls.filter(([path]) => path === "/api/student/reading")).toHaveLength(1);
  });
});
