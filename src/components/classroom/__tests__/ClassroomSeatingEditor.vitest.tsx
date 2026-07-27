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

const onChange = vi.fn();

function renderEditor() {
  return render(
    <ClassroomSeatingEditor
      students={students}
      groups={groups}
      onChange={onChange}
    />,
  );
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
