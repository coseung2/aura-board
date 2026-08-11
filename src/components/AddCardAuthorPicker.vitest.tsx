import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCardAuthorPicker } from "./AddCardAuthorPicker";
import type { AuthorDraftRow } from "./add-card-modal-model";

const fetchClassroomStudentsMock = vi.hoisted(() => vi.fn());
const unsubscribeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/client-lookup-cache", () => ({
  fetchClassroomStudents: fetchClassroomStudentsMock,
  onRosterChanged: vi.fn(() => unsubscribeMock),
}));

function Harness() {
  const [rows, setRows] = useState<AuthorDraftRow[]>([]);
  return (
    <AddCardAuthorPicker
      classroomId="classroom-1"
      rows={rows}
      onChange={setRows}
    />
  );
}

describe("AddCardAuthorPicker", () => {
  afterEach(() => {
    fetchClassroomStudentsMock.mockReset();
    unsubscribeMock.mockReset();
  });

  it("selects a roster student and reorders a free-form author", async () => {
    fetchClassroomStudentsMock.mockResolvedValue([
      { id: "student-2", name: "김민아", number: 2 },
    ]);
    render(<Harness />);

    const rosterStudent = await screen.findByRole("checkbox", {
      name: /김민아/,
    });
    fireEvent.click(rosterStudent);
    expect(screen.getByDisplayValue("김민아")).toBeTruthy();
    expect(screen.getByLabelText("대표 작성자").textContent).toBe("📌");

    fireEvent.click(screen.getByRole("button", { name: "+ 이름만 추가" }));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "외부 강사" } });
    fireEvent.click(screen.getAllByRole("button", { name: "위로 이동" })[1]);

    await waitFor(() => {
      expect(
        screen.getAllByRole<HTMLInputElement>("textbox").map((input) =>
          input.value,
        ),
      ).toEqual(["외부 강사", "김민아"]);
    });
    const primaryRow = screen.getByLabelText("대표 작성자").closest("li");
    expect(primaryRow?.querySelector("input")?.value).toBe("외부 강사");
  });
});
