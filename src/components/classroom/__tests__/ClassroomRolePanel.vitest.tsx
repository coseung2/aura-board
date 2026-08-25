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
    },
  ],
  assignments: [],
  payPolicy: { payMode: "manual", payPeriod: "weekly" as const, payAnchor: 1 },
};

const threeColumnRolesBody = {
  ...rolesBody,
  defs: ["A", "B", "C", "D", "E", "F", "G", "H"].map(
    (label, index) => ({
      ...rolesBody.defs[0],
      id: `role-${index}`,
      key: `role-${index}`,
      labelKo: `역할 ${label}`,
      salaryAmount: 100 + index,
    }),
  ),
  assignments: [
    {
      id: "layout-assignment-1",
      classroomRoleId: "role-0",
      student: { id: "layout-student-1", name: "Alice Example", number: 987 },
    },
    {
      id: "layout-assignment-2",
      classroomRoleId: "role-0",
      student: { id: "layout-student-2", name: "Bob Example", number: 654 },
    },
    {
      id: "layout-assignment-3",
      classroomRoleId: "role-0",
      student: { id: "layout-student-3", name: "Choi Example", number: 321 },
    },
    {
      id: "layout-assignment-4",
      classroomRoleId: "role-6",
      student: { id: "layout-student-4", name: "Dana Example", number: 210 },
    },
  ],
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

  it("portals pay controls into the section header action slot", async () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    const view = render(
      <ClassroomRolePanel
        classroomId="classroom-1"
        unit="원"
        students={students}
        payBarSlot={slot}
        payBarPlacement="header"
      />,
    );

    const manualPay = await screen.findByRole("radio", { name: "수동지급" });
    expect(slot.contains(manualPay)).toBe(true);
    expect(view.container.querySelector(".classroom-role-pay-bar")).toBeNull();
    view.unmount();
    slot.remove();
  });

  it("renders a cardless three-column role list with student names only", async () => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(threeColumnRolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    const roleRows = await waitFor(() => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(".classroom-role-mini-row"),
      );
      if (rows.length !== 8) {
        throw new Error("three-column role rows are not rendered yet");
      }
      return rows;
    });

    expect(
      Array.from(
        document.querySelectorAll(".classroom-role-mini-columns > span"),
      ).map((column) => column.textContent),
    ).toEqual([
      "역할",
      "금액",
      "담당 학생",
      "",
      "역할",
      "금액",
      "담당 학생",
      "",
    ]);
    expect(
      Array.from(document.querySelectorAll(".classroom-role-mini-list")).map(
        (column) => column.querySelectorAll(".classroom-role-mini-row").length,
      ),
    ).toEqual([4, 4]);
    expect(roleRows.every((row) => !row.hasAttribute("data-layout-option"))).toBe(
      true,
    );

    const studentNames = roleRows.flatMap((row) =>
      Array.from(
        row.querySelectorAll(".classroom-role-mini-student"),
      ).map((student) => student.textContent),
    );
    expect(studentNames).toEqual([
      "Choi Example",
      "Bob Example",
      "Alice Example",
      "미배정",
      "미배정",
      "미배정",
      "미배정",
      "미배정",
      "Dana Example",
      "미배정",
    ]);
    expect(studentNames.some((name) => /\d/.test(name ?? ""))).toBe(false);
    expect(
      screen.getAllByRole("button", { name: /역할 [A-H] 역할 삭제/ }),
    ).toHaveLength(8);
  });

  it("removes a role from its row delete icon", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ...rolesBody, defs: [] }))
      .mockResolvedValueOnce(jsonResponse(permissionsBody));
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "도우미 역할 삭제" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "helper",
      enabled: false,
    });
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

  // 지급 정책은 학급 단위 한 행이므로 역할이 몇 개든 쓰기 요청은 1회여야 한다.
  it("switches to 자동지급 with a single classroom-level write", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ payMode: "auto", payPeriod: "weekly", payAnchor: 3 }),
    );
    renderPanel();

    fireEvent.click(await screen.findByRole("radio", { name: "자동지급" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles/pay-policy",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      payMode: "auto",
    });
    expect(await screen.findByLabelText("지급 주기")).toBeTruthy();
    expect(screen.getByLabelText("지급 기준일")).toBeTruthy();
  });

  it("shows 자동지급 immediately and rolls back when the write fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "지급 방식을 저장하지 못했습니다." }, false),
    );
    renderPanel();

    const autoRadio = await screen.findByRole("radio", { name: "자동지급" });
    fireEvent.click(autoRadio);

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "수동지급" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "지급 방식을 저장하지 못했습니다.",
    );
    // 실패해도 역할 목록을 다시 받아오지 않는다 (초기 2회만).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("pays every role in one request after the confirm prompt", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(assignedRolesBody))
      .mockResolvedValueOnce(jsonResponse(permissionsBody))
      .mockResolvedValueOnce(jsonResponse({ paidRoles: 1, paidStudents: 1 }));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "지급" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles/pay",
    );
    // roleKey 없이 보내면 서버가 학급 전체를 한 트랜잭션으로 지급한다.
    const payBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payBody.roleKey).toBeUndefined();
    expect(typeof payBody.requestKey).toBe("string");
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
