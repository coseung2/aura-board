"use client";

import { useCallback, useEffect, useState } from "react";
import { RolePermissionModal } from "./RolePermissionModal";

/**
 * Role-first 1인1역 panel for the classroom dashboard.
 *
 * Each tile is a role (not a student), so a role can hold any number of
 * students. The tile shows the role label, its salary, and the assigned
 * students. This panel replaces the standalone /classroom/[id]/roles page, so
 * it also owns salary editing, permission editing, student assignment, and
 * role removal — all through modals instead of a separate route.
 */

type PayPeriod = "daily" | "weekly" | "monthly";
type PayMode = "auto" | "manual";

type RoleStudent = { id: string; name: string; number: number | null };

type RoleTile = {
  id: string;
  key: string;
  labelKo: string;
  salaryAmount: number;
  students: RoleStudent[];
  permissions: Record<string, boolean>;
  description: string;
  emoji: string | null;
};

/** 지급 방식/주기/기준일은 학급 단위 단일 값이다 (2026-07-28). */
type PayPolicy = {
  payMode: PayMode;
  payPeriod: PayPeriod;
  payAnchor: number | null;
};

const DEFAULT_PAY_POLICY: PayPolicy = {
  payMode: "manual",
  payPeriod: "weekly",
  payAnchor: null,
};

type CatalogEntry = {
  key: string;
  label: string;
  description: string;
  category: string;
  defaultRoles: readonly string[];
};

type RolesResponse = {
  defs?: Array<{
    id: string;
    key: string;
    labelKo: string;
    emoji?: string | null;
    description?: string;
    salaryAmount?: number | null;
  }>;
  assignments?: Array<{
    id: string;
    classroomRoleId: string;
    student: RoleStudent;
  }>;
  payPolicy?: {
    payMode?: string | null;
    payPeriod?: PayPeriod | null;
    payAnchor?: number | null;
  } | null;
};

type PermissionsResponse = {
  catalog?: CatalogEntry[];
  roles?: Array<{ key: string; description: string; permissions: Record<string, boolean> }>;
};

type Props = {
  classroomId: string;
  unit: string;
  /** Classroom roster, used by the assignment modal. */
  students: RoleStudent[];
  /**
   * Element in the section divider row that hosts the pay controls. The panel
   * portals them there so the divider owns their placement.
   */
  payBarSlot?: HTMLElement | null;
};

const PAY_PERIODS: Array<{ value: PayPeriod; label: string }> = [
  { value: "daily", label: "일급" },
  { value: "weekly", label: "주급" },
  { value: "monthly", label: "월급" },
];

function normalizePayPeriod(value: PayPeriod | null | undefined): PayPeriod {
  return value === "daily" || value === "monthly" ? value : "weekly";
}

/** Normalizes a server pay policy payload; missing fields fall back. */
function normalizePayPolicy(
  policy: RolesResponse["payPolicy"] | undefined,
): PayPolicy {
  const payPeriod = normalizePayPeriod(policy?.payPeriod);
  return {
    payMode: policy?.payMode === "auto" ? "auto" : "manual",
    payPeriod,
    payAnchor:
      payPeriod === "daily"
        ? null
        : typeof policy?.payAnchor === "number"
          ? policy.payAnchor
          : 1,
  };
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];


function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

export function ClassroomRolePanel({
  classroomId,
  unit,
  students,
  payBarSlot,
}: Props) {
  const [roles, setRoles] = useState<RoleTile[]>([]);
  const [payPolicy, setPayPolicy] = useState<PayPolicy>(DEFAULT_PAY_POLICY);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleSalary, setNewRoleSalary] = useState("0");
  /** Students picked while creating a role; assigned right after creation. */
  const [newRoleStudentIds, setNewRoleStudentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /**
   * 지급바 전용 저장 플래그. 역할 편집(`saving`)과 분리해서, 급여 지급 설정을
   * 만지는 동안 역할 타일이 잠기지 않게 한다.
   */
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  /** Role key currently open in the edit modal. */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** Role key currently open in the permission modal. */
  const [permissionKey, setPermissionKey] = useState<string | null>(null);
  const [salaryDraft, setSalaryDraft] = useState("0");
  const [labelDraft, setLabelDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [res, permissionsRes] = await Promise.all([
        fetch(`/api/classrooms/${classroomId}/roles`, { cache: "no-store" }),
        fetch(`/api/classrooms/${classroomId}/role-permissions`, {
          cache: "no-store",
        }),
      ]);
      if (!res.ok) {
        setError("역할을 불러오지 못했습니다.");
        return;
      }
      const data = (await res.json()) as RolesResponse;
      const permissionsData = permissionsRes.ok
        ? ((await permissionsRes.json()) as PermissionsResponse)
        : {};
      const permissionByKey = new Map(
        (permissionsData.roles ?? []).map((role) => [role.key, role]),
      );
      const studentsByRole = new Map<string, RoleStudent[]>();
      for (const assignment of data.assignments ?? []) {
        const list = studentsByRole.get(assignment.classroomRoleId) ?? [];
        list.push(assignment.student);
        studentsByRole.set(assignment.classroomRoleId, list);
      }
      setRoles(
        (data.defs ?? []).map((role) => {
          const permissionRole = permissionByKey.get(role.key);
          return {
            id: role.id,
            key: role.key,
            labelKo: role.labelKo,
            emoji: role.emoji ?? null,
            description: role.description ?? permissionRole?.description ?? "",
            salaryAmount:
              typeof role.salaryAmount === "number" ? role.salaryAmount : 0,
            permissions: permissionRole?.permissions ?? {},
            students: (studentsByRole.get(role.id) ?? []).sort(
              (a, b) => (a.number ?? 999) - (b.number ?? 999),
            ),
          };
        }),
      );
      setPayPolicy(normalizePayPolicy(data.payPolicy));
      setCatalog(permissionsData.catalog ?? []);
    } catch {
      setError("역할을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [classroomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function closeAddModal() {
    if (saving) return;
    setAddOpen(false);
    setNewRoleLabel("");
    setNewRoleSalary("0");
    setNewRoleStudentIds([]);
    setAddError(null);
  }

  /** Creates a teacher-authored role from the typed name. */
  async function submitRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const labelKo = newRoleLabel.trim();
    if (!labelKo || saving) return;
    const salaryAmount = Number(newRoleSalary.trim() || "0");
    if (!Number.isInteger(salaryAmount) || salaryAmount < 0) {
      setAddError("급여는 0 이상의 정수로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          labelKo,
          salaryAmount,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setAddError(body?.error ?? "역할을 추가하지 못했습니다.");
        return;
      }

      // Assign the picked students to the freshly created role.
      const created = (await res.json().catch(() => null)) as {
        role?: { key?: string };
      } | null;
      const createdKey = created?.role?.key;
      if (createdKey && newRoleStudentIds.length > 0) {
        for (const studentId of newRoleStudentIds) {
          const assignRes = await fetch(
            `/api/classrooms/${classroomId}/roles/set`,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ studentId, roleKey: createdKey }),
            },
          );
          if (!assignRes.ok) {
            const assignBody = (await assignRes.json().catch(() => null)) as {
              error?: string;
            } | null;
            setAddError(
              assignBody?.error ?? "역할은 만들었지만 학생 지정에 실패했어요.",
            );
            await refresh();
            return;
          }
        }
      }

      setAddOpen(false);
      setNewRoleLabel("");
      setNewRoleSalary("0");
      setNewRoleStudentIds([]);
      await refresh();
    } catch {
      setAddError("역할을 추가하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  const editingRole = roles.find((role) => role.key === editingKey) ?? null;
  const permissionRole =
    roles.find((role) => role.key === permissionKey) ?? null;

  function openEdit(role: RoleTile) {
    setEditingKey(role.key);
    setSalaryDraft(String(role.salaryAmount));
    setLabelDraft(role.labelKo);
    setEditError(null);
  }

  function closeEdit() {
    if (saving) return;
    setEditingKey(null);
    setEditError(null);
  }

  /** Commits an inline role rename; only custom roles are renameable. */
  async function commitLabel() {
    if (!editingRole || saving) return;
    const labelKo = labelDraft.trim();
    if (!labelKo || labelKo === editingRole.labelKo) {
      setLabelDraft(editingRole.labelKo);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleKey: editingRole.key, labelKo }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setEditError(body?.error ?? "역할 이름을 변경하지 못했습니다.");
        setLabelDraft(editingRole.labelKo);
        return;
      }
      await refresh();
    } catch {
      setEditError("역할 이름을 변경하지 못했습니다. 다시 시도해 주세요.");
      setLabelDraft(editingRole.labelKo);
    } finally {
      setSaving(false);
    }
  }

  async function saveCompensation() {
    if (!editingRole || saving) return;
    const salaryAmount = Number(salaryDraft.trim());
    if (!Number.isInteger(salaryAmount) || salaryAmount < 0) {
      setEditError("급여는 0 이상의 정수로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleKey: editingRole.key,
          salaryAmount,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setEditError(body?.error ?? "급여 설정을 저장하지 못했습니다.");
        return;
      }
      await refresh();
      setEditingKey(null);
    } catch {
      setEditError("급여 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Assignment is student-scoped server-side (one role per student), so
   * toggling a student writes that student's role key or clears it.
   */
  async function toggleStudent(role: RoleTile, student: RoleStudent) {
    if (saving) return;
    const assigned = role.students.some(
      (candidate) => candidate.id === student.id,
    );
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles/set`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          roleKey: assigned ? null : role.key,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setEditError(body?.error ?? "역할 지정을 변경하지 못했습니다.");
        return;
      }
      await refresh();
    } catch {
      setEditError("역할 지정을 변경하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(role: RoleTile) {
    if (saving) return;
    const confirmed = window.confirm(
      `${role.labelKo} 역할을 제거할까요? 지정된 학생의 역할도 해제됩니다.`,
    );
    if (!confirmed) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleKey: role.key, enabled: false }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setEditError(body?.error ?? "역할을 제거하지 못했습니다.");
        return;
      }
      await refresh();
      setEditingKey(null);
    } catch {
      setEditError("역할을 제거하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * 지급 정책은 학급 단위 한 행이므로 클릭당 요청은 1회다. 이전에는 역할마다
   * PATCH 를 보내서 역할 수만큼 왕복이 발생했고, 응답을 기다리는 동안 지급바
   * 전체가 잠겼다.
   */
  async function applyPayPolicy(
    patch: Partial<PayPolicy>,
    failureMessage: string,
  ) {
    if (savingPolicy) return;
    const previous = payPolicy;
    // 서버 정규화 규칙과 동일하게 미리 반영해, 왕복 중에도 컨트롤이 응답한다.
    const optimistic: PayPolicy = { ...previous, ...patch };
    if (patch.payPeriod !== undefined && patch.payAnchor === undefined) {
      optimistic.payAnchor = patch.payPeriod === "daily" ? null : 1;
    }
    setPayPolicy(optimistic);
    setSavingPolicy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/roles/pay-policy`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPayPolicy(previous);
        setError(body?.error ?? failureMessage);
        return;
      }
      setPayPolicy(
        normalizePayPolicy((await res.json().catch(() => null)) as PayPolicy),
      );
    } catch {
      setPayPolicy(previous);
      setError(failureMessage);
    } finally {
      setSavingPolicy(false);
    }
  }

  function applyPayMode(nextMode: PayMode) {
    if (nextMode === payPolicy.payMode) return;
    return applyPayPolicy(
      { payMode: nextMode },
      "지급 방식을 저장하지 못했습니다.",
    );
  }

  function applyPayPeriod(nextPeriod: PayPeriod) {
    return applyPayPolicy(
      { payPeriod: nextPeriod },
      "지급 주기를 저장하지 못했습니다.",
    );
  }

  function applyPayAnchor(nextAnchor: number) {
    return applyPayPolicy(
      { payAnchor: nextAnchor },
      "지급 기준일을 저장하지 못했습니다.",
    );
  }

  /**
   * 수동지급: confirm once, then pay every role in a single request. 서버가 한
   * 트랜잭션으로 처리하므로 부분 지급으로 끝나지 않는다.
   */
  async function payAll() {
    if (savingPolicy) return;
    const payable = roles.filter(
      (role) => role.salaryAmount > 0 && role.students.length > 0,
    );
    if (payable.length === 0) {
      setError("지급할 수 있는 역할이 없습니다.");
      return;
    }
    const confirmed = window.confirm(
      `${payable.length}개 역할의 급여를 담당 학생에게 지급하시겠습니까?`,
    );
    if (!confirmed) return;
    setSavingPolicy(true);
    setError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/roles/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // 중복 클릭이 이중 지급되지 않도록 요청마다 고유 키를 붙인다.
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "급여를 지급하지 못했습니다.");
        return;
      }
    } catch {
      setError("급여를 지급하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSavingPolicy(false);
    }
  }

  // Pay controls live in the section divider row and write the classroom-level
  // pay policy in one request (2026-07-28). Per-tile duplicates were removed.
  const payBar = (
    <div className="classroom-role-pay-bar">
        <div
          className="segmented-control classroom-role-pay-modes"
          role="radiogroup"
          aria-label="급여 지급 방식"
        >
          <button
            type="button"
            role="radio"
            aria-checked={payPolicy.payMode === "auto"}
            className={`segmented-control-item${payPolicy.payMode === "auto" ? " is-active" : ""}`}
            onClick={() => void applyPayMode("auto")}
            disabled={!loaded}
          >
            자동지급
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={payPolicy.payMode === "manual"}
            className={`segmented-control-item${payPolicy.payMode === "manual" ? " is-active" : ""}`}
            onClick={() => void applyPayMode("manual")}
            disabled={!loaded}
          >
            수동지급
          </button>
        </div>

        {payPolicy.payMode === "auto" ? (
          <>
            <select
              className="classroom-role-select"
              value={payPolicy.payPeriod}
              onChange={(event) =>
                void applyPayPeriod(event.target.value as PayPeriod)
              }
              aria-label="지급 주기"
              disabled={!loaded}
            >
              {PAY_PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>

            {payPolicy.payPeriod === "weekly" ? (
              <select
                className="classroom-role-select"
                value={payPolicy.payAnchor ?? 1}
                onChange={(event) =>
                  void applyPayAnchor(Number(event.target.value))
                }
                aria-label="지급 기준일"
                disabled={!loaded}
              >
                {WEEKDAYS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    매주 {label}요일
                  </option>
                ))}
              </select>
            ) : null}

            {payPolicy.payPeriod === "monthly" ? (
              <select
                className="classroom-role-select"
                value={payPolicy.payAnchor ?? 1}
                onChange={(event) =>
                  void applyPayAnchor(Number(event.target.value))
                }
                aria-label="지급 기준일"
                disabled={!loaded}
              >
                {Array.from({ length: 31 }, (_, index) => index + 1).map(
                  (day) => (
                    <option key={day} value={day}>
                      매월 {day}일
                    </option>
                  ),
                )}
              </select>
            ) : null}

            {payPolicy.payPeriod === "daily" ? (
              <span className="classroom-role-pay-note">매일 지급</span>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="classroom-action-btn classroom-role-pay-now"
            onClick={() => void payAll()}
            disabled={savingPolicy || roles.length === 0}
          >
            {savingPolicy ? "지급 중…" : "지급"}
          </button>
        )}
    </div>
  );

  return (
    <>
      {payBarSlot ? createPortal(payBar, payBarSlot) : payBar}

      {error ? (
        <p className="classroom-dashboard-empty" role="alert">
          {error}
        </p>
      ) : null}

      <div className="classroom-role-mini-grid">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            className="classroom-role-mini-card"
            onClick={() => openEdit(role)}
            aria-label={`${role.labelKo} 역할 설정`}
          >
            <span className="classroom-role-mini-head">
              <strong className="classroom-role-mini-label">
                {role.labelKo}
              </strong>
              <span className="classroom-role-mini-salary">
                {formatNumber(role.salaryAmount)} {unit}
              </span>
            </span>

            <span className="classroom-role-mini-students">
              {role.students.length > 0
                ? role.students
                    .map(
                      (student) =>
                        `${student.number ? `${student.number}번 ` : ""}${student.name}`,
                    )
                    .join("  ")
                : "미배정"}
            </span>
          </button>
        ))}

        {loaded ? (
          <button
            type="button"
            className="classroom-role-mini-add"
            onClick={() => setAddOpen(true)}
          >
            + 역할 추가
          </button>
        ) : null}
      </div>

      {addOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAddModal();
          }}
        >
          <div
            className="add-card-modal classroom-role-add-modal"
            role="dialog"
            aria-modal="true"
            aria-label="역할 추가"
          >
            <div className="modal-header">
              <h3 className="modal-title">역할 추가</h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeAddModal}
                disabled={saving}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form onSubmit={submitRole}>
              <div className="modal-body">
                <div className="classroom-role-add-row">
                <div className="classroom-role-field classroom-role-field-name">
                  <label htmlFor="classroom-role-add-name">역할 이름</label>
                  <input
                    id="classroom-role-add-name"
                    className="classroom-role-name-input"
                    type="text"
                    value={newRoleLabel}
                    onChange={(event) => {
                      setNewRoleLabel(event.target.value);
                      setAddError(null);
                    }}
                    placeholder="예: 칠판 지우기"
                    maxLength={30}
                    autoComplete="off"
                    disabled={saving}
                    autoFocus
                  />
                </div>
                <div className="classroom-role-field classroom-role-field-salary">
                  <label htmlFor="classroom-role-add-salary">급여</label>
                  <div className="classroom-role-input-wrap">
                    <input
                      id="classroom-role-add-salary"
                      className="classroom-role-salary"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={newRoleSalary}
                      onChange={(event) => {
                        setNewRoleSalary(event.target.value);
                        setAddError(null);
                      }}
                      disabled={saving}
                    />
                    <span aria-hidden="true">{unit}</span>
                  </div>
                </div>
                </div>

                <div className="classroom-role-edit-students">
                  <p className="classroom-role-add-label">담당 학생</p>
                  <div className="classroom-role-student-picker">
                    {students.map((student) => {
                      const picked = newRoleStudentIds.includes(student.id);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          className={`classroom-role-student-chip${picked ? " is-assigned" : ""}`}
                          aria-pressed={picked}
                          onClick={() =>
                            setNewRoleStudentIds((current) =>
                              picked
                                ? current.filter((id) => id !== student.id)
                                : [...current, student.id],
                            )
                          }
                          disabled={saving}
                        >
                          {student.number ? `${student.number}번 ` : ""}
                          {student.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {addError ? (
                  <p className="classroom-roles-error" role="alert">
                    {addError}
                  </p>
                ) : null}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={closeAddModal}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="modal-btn-submit"
                  disabled={saving || newRoleLabel.trim().length === 0}
                >
                  {saving ? "추가 중…" : "추가"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingRole ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEdit();
          }}
        >
          <div
            className="add-card-modal classroom-role-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${editingRole.labelKo} 역할 설정`}
          >
            {/* No title row: the 역할 이름 field below already names the role. */}
            <div className="modal-header classroom-role-edit-header">
              <button
                type="button"
                className="modal-close"
                onClick={closeEdit}
                disabled={saving}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* 지급 주기는 타일에서 인라인으로 다룬다 (2026-07-27). */}
              <div className="classroom-role-add-row">
              <div className="classroom-role-field classroom-role-field-name">
                <label htmlFor="classroom-role-edit-name">역할 이름</label>
                <div className="classroom-role-input-wrap">
                  {/* Editable in place; commits on Enter or blur. */}
                  <input
                    id="classroom-role-edit-name"
                    className="classroom-role-name-input"
                    type="text"
                    value={labelDraft}
                    onChange={(event) => {
                      setLabelDraft(event.target.value);
                      setEditError(null);
                    }}
                    onBlur={() => void commitLabel()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitLabel();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setLabelDraft(editingRole.labelKo);
                      }
                    }}
                    maxLength={30}
                    autoComplete="off"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="classroom-role-field classroom-role-field-salary">
                <label htmlFor="classroom-role-edit-salary">급여</label>
                <div className="classroom-role-input-wrap">
                  <input
                    id="classroom-role-edit-salary"
                    className="classroom-role-salary"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={salaryDraft}
                    onChange={(event) => {
                      setSalaryDraft(event.target.value);
                      setEditError(null);
                    }}
                    disabled={saving}
                  />
                  <span aria-hidden="true">{unit}</span>
                </div>
              </div>
              </div>

              <div className="classroom-role-edit-students">
                <p className="classroom-role-add-label">담당 학생</p>
                <div className="classroom-role-student-picker">
                  {students.map((student) => {
                    const assigned = editingRole.students.some(
                      (candidate) => candidate.id === student.id,
                    );
                    return (
                      <button
                        key={student.id}
                        type="button"
                        className={`classroom-role-student-chip${assigned ? " is-assigned" : ""}`}
                        aria-pressed={assigned}
                        onClick={() => void toggleStudent(editingRole, student)}
                        disabled={saving}
                      >
                        {student.number ? `${student.number}번 ` : ""}
                        {student.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {editError ? (
                <p className="classroom-roles-error" role="alert">
                  {editError}
                </p>
              ) : null}
            </div>

            <div className="modal-actions classroom-role-edit-actions">
              <button
                type="button"
                className="classroom-role-remove-btn"
                onClick={() => void removeRole(editingRole)}
                disabled={saving}
              >
                역할 제거
              </button>
              {editingRole.key !== "dj" ? (
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setPermissionKey(editingRole.key)}
                  disabled={saving}
                >
                  권한 편집
                </button>
              ) : null}
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={closeEdit}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="button"
                className="modal-btn-submit"
                onClick={() => void saveCompensation()}
                disabled={saving}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {permissionRole ? (
        <RolePermissionModal
          classroomId={classroomId}
          role={{
            key: permissionRole.key,
            labelKo: permissionRole.labelKo,
            emoji: permissionRole.emoji,
            permissions: permissionRole.permissions,
          }}
          catalog={catalog}
          onClose={() => setPermissionKey(null)}
          onSaved={() => {
            setPermissionKey(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}
import { createPortal } from "react-dom";
