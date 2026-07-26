"use client";

import { useCallback, useEffect, useState } from "react";
import { RolePermissionModal } from "./RolePermissionModal";

type Student = { id: string; name: string; number: number | null };

type PayPeriod = "daily" | "weekly" | "monthly";

type RoleSummary = {
  key: string;
  labelKo: string;
  emoji: string | null;
  description: string;
  assignedStudents: Student[];
  permissions: Record<string, boolean>;
  /** Optional while older API responses are still in circulation. */
  salaryAmount?: number | null;
  /** Optional while older API responses are still in circulation. */
  payPeriod?: PayPeriod | null;
};

type CatalogEntry = {
  key: string;
  label: string;
  description: string;
  category: string;
  defaultRoles: readonly string[];
};

type AvailableRoleDef = {
  id?: string;
  key: string;
  labelKo: string;
  emoji: string | null;
  description?: string;
};

type RolesResponse = {
  defs?: (AvailableRoleDef & {
    id: string;
    salaryAmount?: number | null;
    payPeriod?: PayPeriod | null;
  })[];
  assignments?: {
    id: string;
    studentId: string;
    classroomRoleId: string;
    student: Student;
  }[];
  availableDefs?: AvailableRoleDef[];
};

type PermissionsResponse = {
  catalog?: CatalogEntry[];
  roles?: RoleSummary[];
};

type SalaryDraft = {
  salaryAmount: string;
  payPeriod: PayPeriod;
};

type Props = { classroomId: string };

const PAY_PERIODS: { value: PayPeriod; label: string }[] = [
  { value: "daily", label: "일급" },
  { value: "weekly", label: "주급" },
  { value: "monthly", label: "월급" },
];

function normalizeSalary(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function normalizePayPeriod(value: PayPeriod | null | undefined): PayPeriod {
  return value === "daily" || value === "monthly" ? value : "weekly";
}

function toSalaryDraft(role: RoleSummary): SalaryDraft {
  return {
    salaryAmount: String(normalizeSalary(role.salaryAmount)),
    payPeriod: normalizePayPeriod(role.payPeriod),
  };
}

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body && typeof body.error === "string" ? body.error : fallback;
}

export function ClassroomRolesTab({ classroomId }: Props) {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [availableDefs, setAvailableDefs] = useState<AvailableRoleDef[]>([]);
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, SalaryDraft>>(
    {},
  );
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [salaryErrors, setSalaryErrors] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rolesRes, permissionsRes] = await Promise.all([
        fetch(`/api/classrooms/${classroomId}/roles`, { cache: "no-store" }),
        fetch(`/api/classrooms/${classroomId}/role-permissions`, {
          cache: "no-store",
        }),
      ]);
      if (!rolesRes.ok) {
        setLoadError(await getErrorMessage(rolesRes, "역할을 불러오지 못했습니다."));
        return;
      }
      if (!permissionsRes.ok) {
        setLoadError(
          await getErrorMessage(permissionsRes, "역할 권한을 불러오지 못했습니다."),
        );
        return;
      }
      const [rolesData, permissionsData] = (await Promise.all([
        rolesRes.json(),
        permissionsRes.json(),
      ])) as [RolesResponse, PermissionsResponse];
      const permissionByKey = new Map(
        (permissionsData.roles ?? []).map((role) => [role.key, role]),
      );
      const assignmentsByRole = new Map<string, Student[]>();
      for (const assignment of rolesData.assignments ?? []) {
        const assigned = assignmentsByRole.get(assignment.classroomRoleId) ?? [];
        assigned.push(assignment.student);
        assignmentsByRole.set(assignment.classroomRoleId, assigned);
      }
      const nextRoles = (rolesData.defs ?? []).map((role) => {
        const permissionRole = permissionByKey.get(role.key);
        return {
          ...role,
          description: role.description ?? permissionRole?.description ?? "",
          assignedStudents: assignmentsByRole.get(role.id) ?? [],
          permissions: permissionRole?.permissions ?? {},
          salaryAmount: normalizeSalary(role.salaryAmount),
          payPeriod: normalizePayPeriod(role.payPeriod),
        };
      });
      setCatalog(permissionsData.catalog ?? []);
      setRoles(nextRoles);
      setAvailableDefs(rolesData.availableDefs ?? []);
      setSalaryDrafts(
        Object.fromEntries(nextRoles.map((role) => [role.key, toSalaryDraft(role)])),
      );
      setSalaryErrors({});
      setLoaded(true);
    } catch {
      setLoadError("역할을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoleKey || savingKey) return;

    setSavingKey(`add:${selectedRoleKey}`);
    setMutationError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleKey: selectedRoleKey, enabled: true }),
      });
      if (!res.ok) {
        setMutationError(await getErrorMessage(res, "역할을 추가하지 못했습니다."));
        return;
      }
      setSelectedRoleKey("");
      await refresh();
    } catch {
      setMutationError("역할을 추가하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSavingKey(null);
    }
  }

  async function removeRole(role: RoleSummary) {
    if (savingKey) return;
    const confirmed = window.confirm(
      `${role.labelKo} 역할을 비활성화할까요? 지정된 학생의 역할도 해제됩니다.`,
    );
    if (!confirmed) return;

    setSavingKey(`remove:${role.key}`);
    setMutationError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleKey: role.key, enabled: false }),
      });
      if (!res.ok) {
        setMutationError(await getErrorMessage(res, "역할을 비활성화하지 못했습니다."));
        return;
      }
      await refresh();
    } catch {
      setMutationError("역할을 비활성화하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSavingKey(null);
    }
  }

  function updateSalaryDraft(
    roleKey: string,
    field: keyof SalaryDraft,
    value: string,
  ) {
    setSalaryDrafts((current) => ({
      ...current,
      [roleKey]: {
        ...(current[roleKey] ?? { salaryAmount: "0", payPeriod: "weekly" }),
        [field]: value,
      },
    }));
    if (field === "salaryAmount") {
      setSalaryErrors((current) => {
        if (!current[roleKey]) return current;
        const next = { ...current };
        delete next[roleKey];
        return next;
      });
    }
  }

  async function saveCompensation(event: React.FormEvent<HTMLFormElement>, role: RoleSummary) {
    event.preventDefault();
    if (savingKey) return;

    const draft = salaryDrafts[role.key] ?? toSalaryDraft(role);
    const salaryAmount = Number(draft.salaryAmount.trim());
    if (!Number.isInteger(salaryAmount) || salaryAmount < 0) {
      setSalaryErrors((current) => ({
        ...current,
        [role.key]: "급여는 0 이상의 정수로 입력해 주세요.",
      }));
      return;
    }

    setSavingKey(`save:${role.key}`);
    setMutationError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleKey: role.key,
          salaryAmount,
          payPeriod: draft.payPeriod,
        }),
      });
      if (!res.ok) {
        setMutationError(await getErrorMessage(res, "급여 설정을 저장하지 못했습니다."));
        return;
      }
      await refresh();
    } catch {
      setMutationError("급여 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSavingKey(null);
    }
  }

  const activeRoleKeys = new Set(roles.map((role) => role.key));
  const selectableDefs = availableDefs.filter((def) => !activeRoleKeys.has(def.key));

  const editingRoleData = roles.find((role) => role.key === editingRole) ?? null;

  return (
    <section className="classroom-roles" aria-labelledby="classroom-roles-title">
      <header className="classroom-roles-header">
        <div>
          <h2 id="classroom-roles-title">학급 역할</h2>
          <p className="classroom-roles-desc">
            역할별 급여를 설정하고 권한을 세부 편집합니다.
          </p>
        </div>
        <form className="classroom-roles-add" onSubmit={addRole}>
          <label htmlFor="classroom-role-add">역할 추가</label>
          <div className="classroom-roles-add-controls">
            <select
              id="classroom-role-add"
              className="classroom-role-select"
              value={selectedRoleKey}
              onChange={(event) => setSelectedRoleKey(event.target.value)}
              disabled={loading || savingKey !== null || selectableDefs.length === 0}
            >
              <option value="">
                {selectableDefs.length === 0 ? "추가할 역할 없음" : "역할 선택"}
              </option>
              {selectableDefs.map((def) => (
                <option key={def.key} value={def.key}>
                  {def.emoji ? `${def.emoji} ` : ""}
                  {def.labelKo}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="classroom-roles-add-btn"
              disabled={!selectedRoleKey || loading || savingKey !== null}
            >
              {savingKey?.startsWith("add:") ? "추가 중…" : "역할 추가"}
            </button>
          </div>
        </form>
      </header>

      {loadError && (
        <div className="classroom-roles-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            다시 시도
          </button>
        </div>
      )}
      {mutationError && (
        <p className="classroom-roles-error" role="alert">
          {mutationError}
        </p>
      )}

      {!loaded ? (
        <p className="classroom-roles-loading" role="status" aria-live="polite">
          불러오는 중…
        </p>
      ) : roles.length === 0 ? (
        <p className="classroom-roles-empty">
          활성화된 역할이 없습니다. 위에서 역할을 추가해 주세요.
        </p>
      ) : (
        <ul className="classroom-role-list" aria-label="활성 역할 목록">
          {roles.map((role) => {
            const isDj = role.key === "dj";
            const activeCount = Object.values(role.permissions).filter(Boolean).length;
            const totalCount = Object.keys(role.permissions).length;
            const draft = salaryDrafts[role.key] ?? toSalaryDraft(role);
            const salaryError = salaryErrors[role.key];
            const isSaving = savingKey === `save:${role.key}`;
            const isRemoving = savingKey === `remove:${role.key}`;
            const inputId = `classroom-role-salary-${role.key}`;
            const periodId = `classroom-role-period-${role.key}`;

            return (
              <li key={role.key} className="classroom-role-row">
                <div className="classroom-role-identity">
                  <span className="classroom-role-emoji" aria-hidden="true">
                    {role.emoji ?? "•"}
                  </span>
                  <div className="classroom-role-name-wrap">
                    <span className="classroom-role-label">{role.labelKo}</span>
                    <span className="classroom-role-meta">
                      {role.assignedStudents.length === 0
                        ? "지정 학생 없음"
                        : `${role.assignedStudents.length}명 지정`}
                    </span>
                  </div>
                </div>

                <div className="classroom-role-assignees">
                  {role.assignedStudents.length === 0 ? (
                    <span className="classroom-role-meta-faint">학생 없음</span>
                  ) : (
                    <span title={role.assignedStudents.map((student) => student.name).join(", ")}>
                      {role.assignedStudents
                        .slice(0, 3)
                        .map((student) => student.name)
                        .join(", ")}
                      {role.assignedStudents.length > 3 &&
                        ` 외 ${role.assignedStudents.length - 3}명`}
                    </span>
                  )}
                </div>

                <div className="classroom-role-permissions">
                  <button
                    type="button"
                    className="classroom-role-permission-btn"
                    onClick={() => setEditingRole(role.key)}
                    disabled={isDj || savingKey !== null}
                    aria-label={`${role.labelKo} 권한 편집`}
                  >
                    {isDj ? "보드별 권한" : `권한 ${activeCount}/${totalCount} 편집`}
                  </button>
                </div>

                <form
                  className="classroom-role-compensation"
                  onSubmit={(event) => void saveCompensation(event, role)}
                >
                  <div className="classroom-role-field">
                    <label htmlFor={inputId}>급여</label>
                    <div className="classroom-role-input-wrap">
                      <input
                        id={inputId}
                        className="classroom-role-salary"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={draft.salaryAmount}
                        onChange={(event) =>
                          updateSalaryDraft(role.key, "salaryAmount", event.target.value)
                        }
                        aria-invalid={salaryError ? "true" : undefined}
                        aria-describedby={salaryError ? `${inputId}-error` : undefined}
                        disabled={savingKey !== null}
                      />
                      <span aria-hidden="true">원</span>
                    </div>
                    {salaryError && (
                      <span id={`${inputId}-error`} className="classroom-role-field-error">
                        {salaryError}
                      </span>
                    )}
                  </div>
                  <div className="classroom-role-field">
                    <label htmlFor={periodId}>지급 주기</label>
                    <select
                      id={periodId}
                      className="classroom-role-select"
                      value={draft.payPeriod}
                      onChange={(event) =>
                        updateSalaryDraft(role.key, "payPeriod", event.target.value)
                      }
                      disabled={savingKey !== null}
                    >
                      {PAY_PERIODS.map((period) => (
                        <option key={period.value} value={period.value}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="classroom-role-save-btn"
                    disabled={savingKey !== null}
                  >
                    {isSaving ? "저장 중…" : "급여 저장"}
                  </button>
                </form>

                <div className="classroom-role-actions">
                  <button
                    type="button"
                    className="classroom-role-remove-btn"
                    onClick={() => void removeRole(role)}
                    disabled={savingKey !== null}
                  >
                    {isRemoving ? "비활성화 중…" : "역할 제거"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editingRoleData && (
        <RolePermissionModal
          classroomId={classroomId}
          role={editingRoleData}
          catalog={catalog}
          onClose={() => setEditingRole(null)}
          onSaved={() => {
            setEditingRole(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
