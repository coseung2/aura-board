import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassroomAssignmentsView,
  ClassroomAssignmentDistributeButton,
  ArchivedAssignmentsButton,
} from "./ClassroomAssignmentsView";

const fetchMorningSummaryMock = vi.hoisted(() => vi.fn());
const fetchCleaningDutiesMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/inspections-client", () => ({
  fetchMorningSummary: fetchMorningSummaryMock,
  fetchCleaningDuties: fetchCleaningDutiesMock,
  saveShoeFindings: vi.fn(),
}));

vi.mock("@/hooks/useClassroomMorningRealtime", () => ({
  useClassroomMorningRealtime: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const baseSummary = {
  date: "2026-08-12",
  classroomName: "햇살반",
  kpis: {
    totalStudents: 3,
    missingAssignmentCount: 1,
    missingAssignmentBoardCount: 2,
    cleaningDirtyCount: 0,
    shoeNotArrangedCount: 0,
  },
  missingAssignments: [
    {
      student: { id: "student-a", name: "김학생", number: 1 },
      tasks: [{ id: "task-a", title: "국어 읽기", dueDate: "2026-08-14" }],
    },
    {
      student: { id: "student-b", name: "이학생", number: 2 },
      tasks: [{ id: "task-a", title: "국어 읽기", dueDate: "2026-08-14" }],
    },
  ],
  missingAssignmentBoards: [
    {
      student: { id: "student-c", name: "박학생", number: 3 },
      boards: [
        {
          id: "board-a",
          kind: "board",
          title: "수학 익힘",
          dueDate: "2026-08-13",
          boardName: null,
        },
      ],
    },
    {
      student: { id: "student-c", name: "박학생", number: 3 },
      boards: [
        {
          id: "section-a",
          kind: "section",
          title: "사회 조사 (우리 반 주제판)",
          dueDate: "2026-08-13",
          boardName: "우리 반 주제판",
        },
      ],
    },
  ],
  cleaningFindings: [],
  shoeFindings: [],
};

const checkTasks = [
  {
    id: "task-a",
    title: "국어 읽기",
    description: null,
    dueDate: "2026-08-14",
    isActive: true,
    submittedCount: 1,
    totalStudents: 3,
    createdAt: "2026-08-10T00:00:00.000Z",
  },
];

const archivedItems = [
  {
    id: "task-old",
    kind: "check",
    title: "지난 체크",
    dueDate: "2026-08-01",
    archivedAt: "2026-08-11T00:00:00.000Z",
    boardName: null,
    missingCount: 2,
  },
  {
    id: "board-old",
    kind: "board",
    title: "옛 보드 과제",
    dueDate: null,
    archivedAt: "2026-08-10T00:00:00.000Z",
    boardName: null,
    missingCount: 3,
  },
  {
    id: "section-old",
    kind: "section",
    title: "옛 섹션 (우리 반 주제판)",
    dueDate: "2026-08-02",
    archivedAt: "2026-08-09T00:00:00.000Z",
    boardName: "우리 반 주제판",
    missingCount: 1,
  },
];

describe("ClassroomAssignmentsView", () => {
  beforeEach(() => {
    fetchCleaningDutiesMock.mockResolvedValue({ duties: [] });
    fetchMorningSummaryMock.mockResolvedValue(baseSummary);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = String(url);
      if (method === "GET" && path.endsWith("/checks")) {
        return Promise.resolve(jsonResponse({ tasks: checkTasks }));
      }
      if (method === "GET" && path.includes("/checks/")) {
        return Promise.resolve(
          jsonResponse({
            task: checkTasks[0],
            roster: [
              {
                student: { id: "student-a", name: "김학생", number: 1 },
                submission: null,
              },
              {
                student: { id: "student-b", name: "이학생", number: 2 },
                submission: null,
              },
              {
                student: { id: "student-c", name: "박학생", number: 3 },
                submission: { submitted: true },
              },
            ],
          }),
        );
      }
      if (method === "GET" && path.includes("/assignments/archived")) {
        return Promise.resolve(jsonResponse({ items: archivedItems }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("lists check and board assignments with kind colors and toggles", async () => {
    render(<ClassroomAssignmentsView classroomId="classroom-a" />);

    expect(await screen.findByText("국어 읽기")).toBeTruthy();
    expect(screen.getByText("제출 과제")).toBeTruthy();
    expect(screen.getAllByText("보드 과제")).toHaveLength(1);
    // 섹션 과제 라벨은 괄호 안 실제 보드명(파란색)으로 대체된다.
    const sectionKind = screen.getByText("우리 반 주제판");
    expect(sectionKind.className).toContain("kind-board");

    expect(
      screen.getByRole("switch", { name: "국어 읽기 마감" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(
      screen.getByRole("switch", { name: "수학 익힘 마감" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(
      screen.getByRole("switch", { name: /사회 조사.*마감/ }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");

    // 섹션 과제: 괄호 보드명은 제거되고, 호버용 풀네임은 title로 유지된다.
    const sectionTitle = screen.getByText("사회 조사");
    expect(sectionTitle.getAttribute("title")).toBe(
      "사회 조사 (우리 반 주제판)",
    );

    // 미제출 인원/마감일 아이콘은 보드명(유형 라벨)과 같은 행 좌측에 배치된다.
    expect(
      screen.getByText("2명").closest(".classroom-assignment-item-kind-row"),
    ).toBeTruthy();
    for (const node of screen.getAllByText("1명")) {
      expect(node.closest(".classroom-assignment-item-kind-row")).toBeTruthy();
    }
  });

  it("archives a check assignment and removes it from the list", async () => {
    render(<ClassroomAssignmentsView classroomId="classroom-a" />);

    const toggle = await screen.findByRole("switch", { name: "국어 읽기 마감" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText("국어 읽기")).toBeNull();
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    expect(String(patchCall?.[0])).toContain("/checks/task-a");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      isActive: false,
    });
    expect(
      await screen.findByText(/보관함에서 복구할 수 있어요/),
    ).toBeTruthy();
  });

  it("archives a board assignment via the board API after confirm", async () => {
    render(<ClassroomAssignmentsView classroomId="classroom-a" />);

    fireEvent.click(
      await screen.findByRole("switch", { name: "수학 익힘 마감" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("수학 익힘")).toBeNull();
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    expect(String(patchCall?.[0])).toContain("/api/boards/board-a");
    const body = JSON.parse(String(patchCall?.[1]?.body));
    expect(typeof body.assignmentArchivedAt).toBe("string");
    expect(
      await screen.findByText(/보관함에서 복구할 수 있어요/),
    ).toBeTruthy();
  });

  it("archives a section assignment via the section API", async () => {
    render(<ClassroomAssignmentsView classroomId="classroom-a" />);

    fireEvent.click(
      await screen.findByRole("switch", { name: /사회 조사.*마감/ }),
    );

    await waitFor(() => {
      expect(screen.queryByText("사회 조사")).toBeNull();
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    expect(String(patchCall?.[0])).toContain("/api/sections/section-a");
  });

  it("shows the chevrons button when the list overflows and expands on click", async () => {
    const originalScroll = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const originalClient = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 100,
    });

    render(<ClassroomAssignmentsView classroomId="classroom-a" />);

    const buttons = await screen.findAllByRole("button", {
      name: /미제출 명단 펼치기/,
    });
    expect(buttons.length).toBeGreaterThan(0);
    const first = buttons[0];
    const article = first.closest("article");
    expect(first.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(article?.className).toContain("is-expanded");

    // 재측정(리사이즈)이 일어나도 펼친 항목은 접기 버튼이 유지되어야 한다.
    window.dispatchEvent(new Event("resize"));
    expect(
      screen.getByRole("button", { name: /미제출 명단 접기/ }),
    ).toBeTruthy();

    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(article?.className).not.toContain("is-expanded");

    if (originalScroll) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollHeight",
        originalScroll,
      );
    } else {
      delete (HTMLElement.prototype as { scrollHeight?: unknown }).scrollHeight;
    }
    if (originalClient) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientHeight",
        originalClient,
      );
    } else {
      delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight;
    }
  });

  it("distributes a new check assignment from the header button", async () => {
    render(<ClassroomAssignmentDistributeButton classroomId="classroom-a" />);

    fireEvent.click(screen.getByRole("button", { name: "+ 과제 배부" }));
    expect(screen.getByRole("dialog", { name: "과제 배부" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "사회 퀴즈" },
    });
    fireEvent.click(screen.getByRole("button", { name: "배부" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      title: "사회 퀴즈",
    });
  });

  it("shows archived assignments in the drawer and restores them", async () => {
    render(<ArchivedAssignmentsButton classroomId="classroom-a" />);

    fireEvent.click(screen.getByRole("button", { name: "보관함" }));
    expect(await screen.findByRole("dialog", { name: "보관함" })).toBeTruthy();
    expect(await screen.findByText("지난 체크")).toBeTruthy();
    expect(screen.getByText("옛 보드 과제")).toBeTruthy();
    expect(screen.getByText("옛 섹션")).toBeTruthy();
    expect(screen.getByText("우리 반 주제판")).toBeTruthy();
    expect(screen.getByText(/미제출 2명/)).toBeTruthy();
    expect(screen.getByText(/미제출 3명/)).toBeTruthy();

    const lastPatch = () => {
      const calls = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === "PATCH",
      );
      return calls[calls.length - 1];
    };

    // 제출 과제 복원
    fireEvent.click(screen.getAllByRole("button", { name: "복원" })[0]);
    await waitFor(() => {
      expect(screen.queryByText("지난 체크")).toBeNull();
    });
    expect(String(lastPatch()?.[0])).toContain("/checks/task-old");
    expect(JSON.parse(String(lastPatch()?.[1]?.body))).toEqual({
      isActive: true,
    });

    // 보드 과제 복원
    fireEvent.click(screen.getAllByRole("button", { name: "복원" })[0]);
    await waitFor(() => {
      expect(screen.queryByText("옛 보드 과제")).toBeNull();
    });
    expect(String(lastPatch()?.[0])).toContain("/api/boards/board-old");
    expect(JSON.parse(String(lastPatch()?.[1]?.body))).toEqual({
      assignmentArchivedAt: null,
    });

    // 섹션 과제 복원
    fireEvent.click(screen.getAllByRole("button", { name: "복원" })[0]);
    await waitFor(() => {
      expect(screen.queryByText("옛 섹션")).toBeNull();
    });
    expect(String(lastPatch()?.[0])).toContain("/api/sections/section-old");
    expect(JSON.parse(String(lastPatch()?.[1]?.body))).toEqual({
      assignmentArchivedAt: null,
    });
    expect(screen.getByText("보관된 과제가 없어요.")).toBeTruthy();
  });

  it("archives instantly from the toggle and restores back into the list without reload", async () => {
    render(
      <>
        <ClassroomAssignmentsView classroomId="classroom-a" />
        <ArchivedAssignmentsButton classroomId="classroom-a" />
      </>,
    );

    // 토글 클릭만으로 즉시 아카이빙 (확인창 없음)
    fireEvent.click(
      await screen.findByRole("switch", { name: "수학 익힘 마감" }),
    );
    await waitFor(() => {
      expect(screen.queryByText("수학 익힘")).toBeNull();
    });

    // 드로어가 방금 보관된 과제를 보여주도록 목 응답을 지정
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "board-a",
            kind: "board",
            title: "수학 익힘",
            dueDate: "2026-08-13",
            archivedAt: "2026-08-12T00:00:00.000Z",
            boardName: null,
            missingCount: 1,
          },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "보관함" }));
    expect(await screen.findByText("수학 익힘")).toBeTruthy();

    // 드로어에서 복원 → 메인 목록에 새로고침 없이 복귀
    fireEvent.click(screen.getByRole("button", { name: "복원" }));
    await waitFor(() => {
      const matches = screen.getAllByText("수학 익힘");
      // 메인 카드 1곳에만 남고 드로어 목록에서는 사라진다.
      expect(matches).toHaveLength(1);
      expect(
        matches[0].closest(".classroom-assignment-item"),
      ).toBeTruthy();
    });
  });
});
