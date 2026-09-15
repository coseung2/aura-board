import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudentRandomPickerPanel,
  type StudentRandomPickerPanelProps,
} from "./StudentRandomPickerPanel";

afterEach(cleanup);

const students = [
  { id: "s1", name: "가온", number: 1, gender: "female" as const },
  { id: "s2", name: "나래", number: 2, gender: "male" as const },
  { id: "s3", name: "다온", number: 3, gender: "female" as const },
];

function makeProps(
  overrides: Partial<StudentRandomPickerPanelProps> = {},
): StudentRandomPickerPanelProps {
  return {
    classrooms: [{ id: "c1", name: "1학년 1반", studentCount: 3 }],
    classroomsLoaded: true,
    classroomsError: "",
    activeClassroomId: "c1",
    students,
    studentsLoaded: true,
    studentsError: "",
    eligibleStudents: students,
    pickerFilter: "all",
    pickerCount: 2,
    pickedStudents: [],
    highlightedStudentId: null,
    drawingStudents: false,
    onClose: vi.fn(),
    onChooseClassroom: vi.fn(),
    onChooseFilter: vi.fn(),
    onChangePickerCount: vi.fn(),
    onDraw: vi.fn(),
    ...overrides,
  };
}

describe("StudentRandomPickerPanel", () => {
  it("opens centered at a useful size and stays movable within the viewport", () => {
    render(<StudentRandomPickerPanel {...makeProps()} />);
    const panel = screen.getByRole("dialog", { name: "학생 랜덤뽑기" });
    const handle = screen.getByRole("button", { name: "학생 랜덤뽑기 이동" });
    const initialLeft = Number.parseFloat(panel.style.left);
    const initialTop = Number.parseFloat(panel.style.top);
    const width = Number.parseFloat(panel.style.width);
    const height = Number.parseFloat(panel.style.height);

    expect(width).toBe(Math.min(640, window.innerWidth - 24));
    expect(height).toBe(Math.min(560, window.innerHeight - 24));
    expect(initialLeft).toBeCloseTo((window.innerWidth - width) / 2);
    expect(initialTop).toBeCloseTo((window.innerHeight - height) / 2);
    expect(panel.style.right).toBe("auto");
    expect(panel.style.bottom).toBe("auto");

    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(() => ({
      left: Number.parseFloat(panel.style.left), top: Number.parseFloat(panel.style.top),
      width: Number.parseFloat(panel.style.width), height: Number.parseFloat(panel.style.height),
      right: 0, bottom: 0, x: 0, y: 0, toJSON() {},
    }));
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(Number.parseFloat(panel.style.left)).toBe(initialLeft + 10);
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(Number.parseFloat(panel.style.top)).toBe(
      Math.min(initialTop + 40, window.innerHeight - height - 12),
    );
    for (let index = 0; index < 100; index++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(panel.style.left).toBe("12px");
    for (let index = 0; index < 100; index++) fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(Number.parseFloat(panel.style.top)).toBeLessThanOrEqual(window.innerHeight - height - 12);
    expect(screen.getByRole("button", { name: "학생 랜덤뽑기 크기 조절" })).toBeInTheDocument();
  });

  it("resizes the window from its corner handle", () => {
    render(<StudentRandomPickerPanel {...makeProps()} />);
    const panel = screen.getByRole("dialog", { name: "학생 랜덤뽑기" });
    const resizeHandle = screen.getByRole("button", { name: "학생 랜덤뽑기 크기 조절" });

    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(() => ({
      left: Number.parseFloat(panel.style.left), top: Number.parseFloat(panel.style.top),
      width: Number.parseFloat(panel.style.width), height: Number.parseFloat(panel.style.height),
      right: 0, bottom: 0, x: 0, y: 0, toJSON() {},
    }));

    fireEvent.pointerDown(resizeHandle, { button: 0, isPrimary: true, pointerId: 1, clientX: 600, clientY: 700 });
    fireEvent.pointerMove(resizeHandle, { pointerId: 1, clientX: 420, clientY: 520 });
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 });

    expect(Number.parseFloat(panel.style.width)).toBeGreaterThanOrEqual(360);
    expect(Number.parseFloat(panel.style.height)).toBeGreaterThanOrEqual(360);
    expect(Number.parseFloat(panel.style.width)).toBeLessThan(640);
    expect(Number.parseFloat(panel.style.height)).toBeLessThan(560);
  });

  it("guides the teacher from classroom selection into the picker", () => {
    const onChooseClassroom = vi.fn();
    render(
      <StudentRandomPickerPanel
        {...makeProps({ activeClassroomId: null, studentsLoaded: false, onChooseClassroom })}
      />,
    );


    fireEvent.change(screen.getByRole("combobox"), { target: { value: "c1" } });
    expect(onChooseClassroom).toHaveBeenCalledWith("c1");
  });

  it("exposes count, target, close, and draw controls", () => {
    const onClose = vi.fn();
    const onChooseFilter = vi.fn();
    const onChangePickerCount = vi.fn();
    const onDraw = vi.fn();
    render(
      <StudentRandomPickerPanel
        {...makeProps({ onClose, onChooseFilter, onChangePickerCount, onDraw })}
      />,
    );

    expect(screen.getByRole("button", { name: "2명 랜덤 뽑기" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "뽑을 인원 줄이기" }));
    fireEvent.click(screen.getByRole("button", { name: "뽑을 인원 늘리기" }));
    fireEvent.click(screen.getByRole("button", { name: "여학생" }));
    fireEvent.click(screen.getByRole("button", { name: "2명 랜덤 뽑기" }));
    fireEvent.click(screen.getByRole("button", { name: "학생 랜덤뽑기 닫기" }));

    expect(onChangePickerCount).toHaveBeenNthCalledWith(1, 1);
    expect(onChangePickerCount).toHaveBeenNthCalledWith(2, 3);
    expect(onChooseFilter).toHaveBeenCalledWith("female");
    expect(onDraw).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the live highlighted student while drawing", () => {
    render(
      <StudentRandomPickerPanel
        {...makeProps({ drawingStudents: true, highlightedStudentId: "s2" })}
      />,
    );

    expect(screen.getByText("두구두구...")).toBeInTheDocument();
    expect(screen.getAllByText("나래")).toHaveLength(2);
    expect(screen.getByText("2번")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "두구두구... 뽑는 중" })).toBeDisabled();
  });

  it("keeps the rapidly changing spotlight name out of live regions", () => {
    const { rerender } = render(
      <StudentRandomPickerPanel
        {...makeProps({ drawingStudents: true, highlightedStudentId: "s2" })}
      />,
    );

    const spotlightName = screen
      .getByText("두구두구...")
      .parentElement?.querySelector("strong");
    expect(spotlightName).toBeTruthy();
    expect(spotlightName?.closest("[aria-live]")).toBeNull();

    const announcement = screen.getByText("학생을 뽑고 있어요.");
    expect(announcement).toHaveAttribute("aria-live", "polite");
    expect(announcement).toHaveAttribute("role", "status");

    rerender(
      <StudentRandomPickerPanel
        {...makeProps({ drawingStudents: true, highlightedStudentId: "s3" })}
      />,
    );

    // The spotlight name changed, but the announced text did not.
    expect(screen.getByText("학생을 뽑고 있어요.")).toBeInTheDocument();
    for (const node of screen.getAllByText("다온")) {
      expect(node.closest("[aria-live]")).toBeNull();
    }
  });

  it("announces the confirmed result once through a single live region", () => {
    render(
      <StudentRandomPickerPanel
        {...makeProps({ pickedStudents: [students[0], students[2]] })}
      />,
    );

    const announcement = screen.getByText("1번 가온, 3번 다온 뽑혔어요.");

    // The visual summary and spotlight must not double-announce the result.
    expect(screen.getByText("2명 선택 완료").closest("[aria-live]")).toBeNull();
  });

  it("renders confirmed winners and supports another draw", () => {
    const onDraw = vi.fn();
    render(
      <StudentRandomPickerPanel
        {...makeProps({ pickedStudents: [students[0], students[2]], onDraw })}
      />,
    );

    expect(screen.getByText("2명 선택 완료")).toBeInTheDocument();
    expect(screen.getAllByText("가온")).not.toHaveLength(0);
    expect(screen.getAllByText("다온")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "한 번 더 뽑기" }));
    expect(onDraw).toHaveBeenCalledOnce();
  });
});
