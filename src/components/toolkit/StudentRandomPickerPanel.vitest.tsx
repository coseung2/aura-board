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
  it("moves with arrow keys and keeps the panel within the viewport", () => {
    render(<StudentRandomPickerPanel {...makeProps()} />);
    const panel = screen.getByRole("dialog", { name: "학생 랜덤뽑기" });
    const handle = screen.getByRole("button", { name: "학생 랜덤뽑기 이동" });
    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(() => ({
      left: Number.parseFloat(panel.style.left), top: Number.parseFloat(panel.style.top),
      width: 320, height: 400, right: 0, bottom: 0, x: 0, y: 0, toJSON() {},
    }));
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(panel.style.left).toBe("22px");
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(panel.style.top).toBe("52px");
    for (let index = 0; index < 100; index++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(panel.style.left).toBe("12px");
    panel.style.top = "900px";
    fireEvent(window, new Event("resize"));
    expect(Number.parseFloat(panel.style.top)).toBeLessThanOrEqual(window.innerHeight - 412);
  });

  it("guides the teacher from classroom selection into the picker", () => {
    const onChooseClassroom = vi.fn();
    render(
      <StudentRandomPickerPanel
        {...makeProps({ activeClassroomId: null, studentsLoaded: false, onChooseClassroom })}
      />,
    );

    expect(screen.getByLabelText("현재 1단계")).toBeInTheDocument();
    expect(screen.getByText("누가 뽑힐까요?")).toBeInTheDocument();

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

    expect(screen.getByLabelText("현재 2단계")).toBeInTheDocument();
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

    expect(screen.getByLabelText("현재 3단계")).toBeInTheDocument();
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
    expect(announcement).toHaveAttribute("aria-live", "polite");

    // The visual summary and spotlight must not double-announce the result.
    expect(screen.getByText("2명 선택 완료").closest("[aria-live]")).toBeNull();
    expect(screen.getByText("1번 가온").closest("[aria-live]")).toBeNull();
  });

  it("renders confirmed winners and supports another draw", () => {
    const onDraw = vi.fn();
    render(
      <StudentRandomPickerPanel
        {...makeProps({ pickedStudents: [students[0], students[2]], onDraw })}
      />,
    );

    expect(screen.getByText("2명 선택 완료")).toBeInTheDocument();
    expect(screen.getByText("1번 가온")).toBeInTheDocument();
    expect(screen.getByText("3번 다온")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "한 번 더 뽑기" }));
    expect(onDraw).toHaveBeenCalledOnce();
  });
});
