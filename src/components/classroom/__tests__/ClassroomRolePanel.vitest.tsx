import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomRolePanel } from "../ClassroomRolePanel";

// Replaces the old ClassroomRolesTab suite: the dashboard 1인1역 panel now owns
// role listing, salary editing, assignment, and removal.
const fetchMock = vi.fn();

vi.mock("../RolePermissionModal", () => ({
  RolePermissionModal: () => null,
}));

const rolesBody = {
  defs: [
    {
      id: "role-helper",
      key: "helper",
      labelKo: "도우미",
      emoji: "🧹",
      description: "학급 도우미",
      salaryAmount: 100,
      payPeriod: "weekly" as const,
      payMode: "manual",
      payAnchor: null,
    },
  ],
  assignments: [],
};

const permissionsBody = {
  catalog: [],
  roles: [
    {
      key: "helper",
      description: "학급 도우미",
      permissions: { bank_deposit: true, bank_withdraw: false },
    },
  ],
};

/** Role with salary + an assigned student, so 수동지급 has something to pay. */
const assignedRolesBody = {
  ...rolesBody,
  defs: [{ ...rolesBody.defs[0], salaryAmount: 100 }],
  assignments: [
    {
      id: "assignment-1",
      classroomRoleId: "role-helper",
      student: { id: "student-1", name: "공서희", number: 1 },
    },
  ],
};


const students = [
  { id: "student-1", name: "공서희", number: 1 },
  { id: "student-2", name: "김민아", number: 2 },
];

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function renderPanel() {
  return render(
    <ClassroomRolePanel
      classroomId="classroom-1"
      unit="원"
      students={students}
    />,
  );
}

describe("ClassroomRolePanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(rolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists roles with their salary and an add affordance", async () => {
    renderPanel();

    expect(await screen.findByText("도우미")).toBeTruthy();
    expect(screen.getByText("100 원")).toBeTruthy();
    expect(screen.getByText("미배정")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ 역할 추가" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "수동지급" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "지급" })).toBeTruthy();
  });

  it("creates a teacher-authored role from the typed name", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ role: { key: "custom:c:1" } }))
      .mockResolvedValueOnce(jsonResponse(rolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "+ 역할 추가" }));
    fireEvent.change(screen.getByLabelText("역할 이름"), {
      target: { value: "칠판 지우기" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      labelKo: "칠판 지우기",
      salaryAmount: 0,
    });
  });

  it("assigns picked students right after creating the role", async () => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(rolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody))
      .mockResolvedValueOnce(jsonResponse({ role: { key: "custom:c:1" } }))
      .mockResolvedValueOnce(jsonResponse({ assignment: {} }))
      .mockResolvedValueOnce(jsonResponse(rolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "+ 역할 추가" }));
    fireEvent.change(screen.getByLabelText("역할 이름"), {
      target: { value: "칠판 지우기" },
    });
    fireEvent.click(screen.getByRole("button", { name: "2번 김민아" }));
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(fetchMock.mock.calls[3][0]).toBe(
      "/api/classrooms/classroom-1/roles/set",
    );
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({
      studentId: "student-2",
      roleKey: "custom:c:1",
    });
  });

  it("saves salary from the role modal", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse(rolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "도우미 역할 설정" }),
    );
    fireEvent.change(screen.getByLabelText("급여"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "helper",
      salaryAmount: 300,
    });
  });

  it("switches to 자동지급 from the divider and exposes the schedule pickers", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          ...rolesBody,
          defs: [{ ...rolesBody.defs[0], payMode: "auto", payAnchor: 3 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(await screen.findByRole("radio", { name: "자동지급" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "helper",
      payMode: "auto",
    });
    expect(await screen.findByLabelText("지급 주기")).toBeTruthy();
    expect(screen.getByLabelText("지급 기준일")).toBeTruthy();
  });

  it("pays manually after the confirm prompt", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(assignedRolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody))
      .mockResolvedValueOnce(jsonResponse({ paidStudents: 1 }))
      .mockResolvedValueOnce(jsonResponse(assignedRolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "지급" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles/pay",
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "helper",
    });
  });

  it("renames a custom role from the inline name field", async () => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(customRolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody))
      .mockResolvedValueOnce(jsonResponse({ labelKo: "칠판 담당" }))
      .mockResolvedValueOnce(jsonResponse(customRolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "칠판 지우기 역할 설정" }),
    );
    const input = screen.getByLabelText("역할 이름");
    fireEvent.change(input, { target: { value: "칠판 담당" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "custom:classroom-1:abc",
      labelKo: "칠판 담당",
    });
  });

  it("assigns a student to the role through the roster picker", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ assignment: {} }))
      .mockResolvedValueOnce(jsonResponse(rolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "도우미 역할 설정" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1번 공서희" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles/set",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      studentId: "student-1",
      roleKey: "helper",
    });
  });
});
const customRolesBody = {
  ...rolesBody,
  defs: [
    {
      ...rolesBody.defs[0],
      key: "custom:classroom-1:abc",
      labelKo: "칠판 지우기",
    },
  ],
};
