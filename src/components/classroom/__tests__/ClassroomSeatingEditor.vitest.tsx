import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomSeatingEditor } from "../ClassroomSeatingEditor";

/**
 * Drag regression coverage (2026-07-27). Dragover must only highlight; the
 * seating data may change exactly once, on drop, and always for the seat the
 * cursor actually released over.
 */
const students = [
  { id: "s1", name: "공서희", number: 1, gender: "female" },
  { id: "s2", name: "김민아", number: 2, gender: "female" },
  { id: "s3", name: "김병찬", number: 3, gender: "male" },
  { id: "s4", name: "김예나", number: 4, gender: "female" },
];

const groups = [
  { name: "1모둠", studentIds: ["s1", "s2"] },
  { name: "2모둠", studentIds: ["s3"] },
];

const balancedGroups = [
  { name: "1모둠", studentIds: ["s1", "s2"] },
  { name: "2모둠", studentIds: ["s3", "s4"] },
];

const balancedStudents = students.map((student, index) => ({
  ...student,
  gender: index < 2 ? "female" : "male",
}));

const onChange = vi.fn();

function renderEditor(
  overrides: {
    students?: typeof students;
    groups?: typeof groups;
    disabled?: boolean;
  } = {},
) {
  const view = render(
    <ClassroomSeatingEditor
      students={overrides.students ?? students}
      groups={overrides.groups ?? groups}
      disabled={overrides.disabled}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "도구함" }));
  return view;
}

/** jsdom has no DataTransfer, so pass a minimal stub. */
function dataTransfer(studentId: string) {
  return {
    effectAllowed: "",
    setData: vi.fn(),
    getData: () => studentId,
  };
}

function desk(name: string): HTMLElement {
  return screen.getByRole("button", { name: `${name} 자리` });
}

describe("ClassroomSeatingEditor drag", () => {
  beforeEach(() => {
    onChange.mockReset();
    // jsdom lacks matchMedia; changeGroups probes prefers-reduced-motion.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  it("does not mutate seating while dragging over desks", () => {
    renderEditor();
    const source = desk("공서희");

    fireEvent.dragStart(source, { dataTransfer: dataTransfer("s1") });
    fireEvent.dragOver(desk("김민아"), { dataTransfer: dataTransfer("s1") });
    fireEvent.dragOver(desk("김병찬"), { dataTransfer: dataTransfer("s1") });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("swaps with the desk it was dropped on, not an earlier hover", () => {
    renderEditor();

    fireEvent.dragStart(desk("공서희"), { dataTransfer: dataTransfer("s1") });
    // Hover a different desk first: the stale target used to win.
    fireEvent.dragOver(desk("김민아"), { dataTransfer: dataTransfer("s1") });
    fireEvent.dragOver(desk("김병찬"), { dataTransfer: dataTransfer("s1") });
    fireEvent.drop(desk("김병찬"), { dataTransfer: dataTransfer("s1") });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { name: "1모둠", studentIds: ["s3", "s2"] },
      { name: "2모둠", studentIds: ["s1"] },
    ]);
  });

  it("cancelling a drag leaves the seating untouched", () => {
    renderEditor();

    fireEvent.dragStart(desk("공서희"), { dataTransfer: dataTransfer("s1") });
    fireEvent.dragOver(desk("김병찬"), { dataTransfer: dataTransfer("s1") });
    fireEvent.dragEnd(desk("공서희"), { dataTransfer: dataTransfer("s1") });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ClassroomSeatingEditor interactions", () => {
  beforeEach(() => {
    onChange.mockReset();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  function openAdvanced() {
    if (screen.getByRole("button", { name: "도구함" }).getAttribute("aria-expanded") === "false") {
      fireEvent.click(screen.getByRole("button", { name: "도구함" }));
    }
    fireEvent.click(screen.getByText("고급 조건"));
  }

  it("closes the drawer without removing the seating chart or shuffle action", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "도구함 닫기" }));
    expect(screen.getByRole("button", { name: "도구함" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("complementary", { name: "자리 배치 도구" })).toBeNull();
    expect(screen.getByRole("button", { name: "자리 섞기" })).toBeTruthy();
    expect(desk("공서희")).toBeTruthy();
  });

  it("uses group terminology and keeps the empty fourth seat in a three-student group", () => {
    const { container } = renderEditor({
      groups: [{ name: "", studentIds: ["s1", "s2", "s3"] }],
    });
    expect(screen.getByRole("heading", { name: "1모둠" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "모둠 수 늘리기" })).toBeTruthy();
    const grid = container.querySelector(".seating-area-grid")!;
    expect(grid.children).toHaveLength(4);
    expect(grid.children[2].classList.contains("seating-desk")).toBe(true);
    expect(grid.children[3].classList.contains("is-empty")).toBe(true);
    openAdvanced();
    expect(screen.getByText("모둠별 성비 (여 : 남)")).toBeTruthy();
  });

  function arrangeWithFixedPair(first: string, second: string) {
    openAdvanced();
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "mixed" } });
    fireEvent.change(selects[1], { target: { value: first } });
    fireEvent.change(selects[2], { target: { value: second } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    fireEvent.click(screen.getByRole("button", { name: "자리 섞기" }));
  }

  it("applies a compatible ratio and fixed pair together", () => {
    renderEditor({ students: balancedStudents, groups: balancedGroups });
    openAdvanced();
    fireEvent.click(screen.getByRole("checkbox"));
    const ratioInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(ratioInputs[0], { target: { value: "1" } });
    fireEvent.change(ratioInputs[1], { target: { value: "1" } });
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "mixed" } });
    fireEvent.change(selects[1], { target: { value: "s1" } });
    fireEvent.change(selects[2], { target: { value: "s3" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    fireEvent.click(screen.getByRole("button", { name: "자리 섞기" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextGroups = onChange.mock.calls[0][0];
    const fixedGroup = nextGroups.find((group: { studentIds: string[] }) =>
      group.studentIds.includes("s1"),
    );
    expect(fixedGroup?.studentIds.slice(0, 2).sort()).toEqual(["s1", "s3"]);
    expect(nextGroups.flatMap((group: { studentIds: string[] }) => group.studentIds).sort()).toEqual(
      ["s1", "s2", "s3", "s4"],
    );
  });

  it("preserves fixed partners and reports pair exceptions instead of blocking", () => {
    renderEditor({ students: balancedStudents, groups: balancedGroups });
    arrangeWithFixedPair("s1", "s2");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".seating-random-status")?.textContent).toMatch(/예외 2쌍/);
  });

  it("swaps selected desks by click", () => {
    renderEditor();
    fireEvent.click(desk("공서희"));
    fireEvent.click(desk("김병찬"));

    expect(onChange.mock.calls[0][0]).toEqual([
      { name: "1모둠", studentIds: ["s3", "s2"] },
      { name: "2모둠", studentIds: ["s1"] },
    ]);
  });

  it("swaps selected desks by keyboard activation", () => {
    renderEditor();
    fireEvent.keyDown(desk("공서희"), { key: "Enter" });
    fireEvent.keyDown(desk("김병찬"), { key: "Enter" });

    expect(onChange.mock.calls[0][0][0].studentIds).toEqual(["s3", "s2"]);
    expect(onChange.mock.calls[0][0][1].studentIds).toEqual(["s1"]);
  });

  it("returns an unassigned student into an occupied desk without losing its occupant", () => {
    const withUnassigned = [
      ...students,
      { id: "s5", name: "정하늘", number: 5, gender: "male" },
    ];
    renderEditor({ students: withUnassigned });
    fireEvent.click(screen.getByRole("button", { name: "정하늘 미배정 학생" }));
    fireEvent.click(desk("공서희"));

    expect(onChange.mock.calls[0][0][0].studentIds).toEqual(["s5", "s1", "s2"]);
  });

  it("clears a ratio error as soon as the ratio condition is edited", () => {
    renderEditor({ students: balancedStudents, groups: balancedGroups });
    openAdvanced();
    fireEvent.click(screen.getByRole("checkbox"));
    const ratioInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(ratioInputs[0], { target: { value: "0" } });
    fireEvent.change(ratioInputs[1], { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "자리 섞기" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector(".seating-random-status")?.textContent).toMatch(/성비/);
    fireEvent.change(ratioInputs[0], { target: { value: "1" } });
    fireEvent.change(ratioInputs[1], { target: { value: "1" } });
    expect(document.querySelector(".seating-random-status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "자리 섞기" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(desk("공서희"));
    fireEvent.click(desk("김병찬"));
    expect(document.querySelector(".seating-random-status")).toBeNull();
  });

  it("reports an empty assigned roster without changing groups", () => {
    renderEditor({
      groups: [
        { name: "1모둠", studentIds: [] },
        { name: "2모둠", studentIds: [] },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "자리 섞기" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector(".seating-random-status")?.textContent).toMatch(/배치할 학생이 없습니다/);
  });

  it("shows the actual group count and can remove an empty group", () => {
    renderEditor({
      groups: Array.from({ length: 6 }, (_, index) => ({
        name: `${index + 1}모둠`,
        studentIds: index === 0 ? ["s1"] : [],
      })),
    });

    expect(screen.getByText("6", { selector: "output" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "모둠 수 줄이기" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(5);
  });

  it("does not select or move a desk from the keyboard while disabled", () => {
    renderEditor({ disabled: true });
    fireEvent.keyDown(desk("공서희"), { key: "Enter" });
    fireEvent.keyDown(desk("김병찬"), { key: "Enter" });

    expect(desk("공서희").getAttribute("aria-pressed")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });
});
