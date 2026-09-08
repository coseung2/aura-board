import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { GroupEditorDraft } from "../GroupRosterEditor";

const fetchMock = vi.fn();

vi.mock("../ClassroomSeatingEditor", () => ({
  ClassroomSeatingEditor: ({
    classroomName,
    groups,
    sidebarFooter,
  }: {
    classroomName?: string;
    groups: GroupEditorDraft[];
    sidebarFooter?: ReactNode;
  }) => (
    <div>
      <span data-testid="editor-classroom-name">{classroomName}</span>
      <span data-testid="editor-groups">{JSON.stringify(groups)}</span>
      {sidebarFooter}
    </div>
  ),
}));

vi.mock("../SeatingLayoutLibrary", () => ({
  SeatingLayoutLibrary: ({
    onRestore,
  }: {
    onRestore: (groups: GroupEditorDraft[]) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onRestore([{ name: "복원", studentIds: ["s1", "s1", "missing"] }])
      }
    >
      테스트 복원
    </button>
  ),
}));

import { ClassroomGroupsTab } from "../ClassroomGroupsTab";

const students = [
  { id: "s1", name: "하나", number: 1, gender: "female" },
  { id: "s2", name: "두나", number: 2, gender: "male" },
];

const initialGroups = [{ name: "1분단", studentIds: ["s1", "s2"] }];

describe("ClassroomGroupsTab save separation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("keeps restore in the editor until the explicit classroom apply", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ groups: [{ name: "복원", studentIds: ["s2"] }] }),
    });
    render(
      <ClassroomGroupsTab
        classroomId="classroom-1"
        classroomName="햇살반"
        students={students}
        initialGroups={initialGroups}
      />,
    );

    expect(screen.getByTestId("editor-classroom-name").textContent).toBe(
      "햇살반",
    );
    fireEvent.click(screen.getByRole("button", { name: "테스트 복원" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("editor-groups").textContent).toBe(
      JSON.stringify([{ name: "복원", studentIds: ["s1"] }]),
    );

    const applyButton = screen.getByRole("button", { name: "학급에 적용" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(applyButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/classroom/classroom-1/groups",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      groups: [{ name: "복원", studentIds: ["s1"] }],
    });
  });

  it("allows the default draft to be applied when the server has no groups", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        groups: [{ name: "1분단", studentIds: ["s1", "s2"] }],
      }),
    });
    render(
      <ClassroomGroupsTab
        classroomId="classroom-1"
        classroomName="햇살반"
        students={students}
        initialGroups={[]}
      />,
    );

    const applyButton = screen.getByRole("button", { name: "학급에 적용" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(applyButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      groups: [{ name: "1분단", studentIds: ["s1", "s2"] }],
    });
  });
});
