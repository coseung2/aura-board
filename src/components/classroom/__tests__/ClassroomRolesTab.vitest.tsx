import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomRolesTab } from "../ClassroomRolesTab";

const fetchMock = vi.fn();

vi.mock("../RolePermissionModal", () => ({
  RolePermissionModal: () => null,
}));

const role = {
  key: "helper",
  labelKo: "도우미",
  emoji: "🧹",
  description: "학급 도우미",
  assignedStudents: [],
  permissions: { bank_deposit: true, bank_withdraw: false },
  salaryAmount: 100,
  payPeriod: "weekly" as const,
};

const responseBody = {
  catalog: [],
  roles: [role],
};

const roleSettingsBody = {
  defs: [
    {
      id: "role-helper",
      key: "helper",
      labelKo: "도우미",
      emoji: "🧹",
      description: "학급 도우미",
      salaryAmount: 100,
      payPeriod: "weekly" as const,
    },
  ],
  assignments: [],
  availableDefs: [
    {
      id: "role-leader",
      key: "leader",
      labelKo: "반장",
      emoji: "⭐",
      description: "학급 대표",
    },
  ],
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

describe("ClassroomRolesTab", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(roleSettingsBody))
      .mockResolvedValueOnce(jsonResponse(responseBody));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads active roles and exposes available roles", async () => {
    render(<ClassroomRolesTab classroomId="classroom-1" />);

    expect(await screen.findByText("도우미")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "역할 추가" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /반장/ })).toBeTruthy();
    expect((screen.getByLabelText("급여") as HTMLInputElement).value).toBe("100");
    expect((screen.getByLabelText("지급 주기") as HTMLSelectElement).value).toBe(
      "weekly",
    );
  });

  it("adds a selected available role and reloads server state", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(roleSettingsBody))
      .mockResolvedValueOnce(jsonResponse(responseBody))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({ ...roleSettingsBody, availableDefs: [] }),
      )
      .mockResolvedValueOnce(jsonResponse(responseBody));
    render(<ClassroomRolesTab classroomId="classroom-1" />);

    const addSelect = await screen.findByRole("combobox", { name: "역할 추가" });
    fireEvent.change(addSelect, { target: { value: "leader" } });
    fireEvent.click(screen.getByRole("button", { name: "역할 추가" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "leader",
      enabled: true,
    });
  });

  it("saves a non-negative integer salary and pay period, then reloads", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(roleSettingsBody))
      .mockResolvedValueOnce(jsonResponse(responseBody))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse(roleSettingsBody))
      .mockResolvedValueOnce(jsonResponse(responseBody));
    render(<ClassroomRolesTab classroomId="classroom-1" />);

    const salary = await screen.findByLabelText("급여");
    fireEvent.change(salary, { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("지급 주기"), {
      target: { value: "monthly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "급여 저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "helper",
      salaryAmount: 300,
      payPeriod: "monthly",
    });
  });

  it("confirms role removal and reloads after DELETE", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(roleSettingsBody))
      .mockResolvedValueOnce(jsonResponse(responseBody))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ...roleSettingsBody, defs: [] }))
      .mockResolvedValueOnce(jsonResponse({ ...responseBody, roles: [] }));
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<ClassroomRolesTab classroomId="classroom-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "역할 제거" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(window.confirm).toHaveBeenCalledWith(
      "도우미 역할을 비활성화할까요? 지정된 학생의 역할도 해제됩니다.",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/classrooms/classroom-1/roles",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      roleKey: "helper",
      enabled: false,
    });
  });

  it("shows a recoverable error when loading fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<ClassroomRolesTab classroomId="classroom-1" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("역할을 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});
