"use client";

import { createPortal } from "react-dom";
import { RolePermissionModal } from "./RolePermissionModal";
import {
  PAY_PERIODS, WEEKDAYS, formatNumber, useClassroomRolePanel,
  type PayPeriod, type Props,
} from "./useClassroomRolePanel";

export function ClassroomRolePanel({ classroomId, unit, students, payBarSlot }: Props) {
  const {
    roles,
    payPolicy,
    catalog,
    loaded,
    error,
    addOpen,
    setAddOpen,
    newRoleLabel,
    setNewRoleLabel,
    newRoleSalary,
    setNewRoleSalary,
    newRoleStudentIds,
    setNewRoleStudentIds,
    saving,
    savingPolicy,
    addError,
    setAddError,
    editingRole,
    permissionRole,
    salaryDraft,
    setSalaryDraft,
    labelDraft,
    setLabelDraft,
    editError,
    setEditError,
    refresh,
    closeAddModal,
    submitRole,
    openEdit,
    closeEdit,
    commitLabel,
    saveCompensation,
    toggleStudent,
    removeRole,
    applyPayMode,
    applyPayPeriod,
    applyPayAnchor,
    payAll,
    setPermissionKey,
  } = useClassroomRolePanel({ classroomId, students });
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
  const roleColumnBreak = Math.ceil(roles.length / 2);
  const roleColumns = [
    roles.slice(0, roleColumnBreak),
    roles.slice(roleColumnBreak),
  ].filter((columnRoles) => columnRoles.length > 0);

  return (
    <>
      {payBarSlot ? createPortal(payBar, payBarSlot) : payBar}

      {error ? (
        <p className="classroom-dashboard-empty" role="alert">
          {error}
        </p>
      ) : null}

      <div className="classroom-role-mini-column-layout">
        {roleColumns.map((columnRoles, columnIndex) => (
          <div className="classroom-role-mini-list" key={columnIndex}>
            <div className="classroom-role-mini-columns" aria-hidden="true">
              <span>역할</span>
              <span>금액</span>
              <span>담당 학생</span>
            </div>

            {columnRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                className="classroom-role-mini-row"
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
                    ? role.students.map((student) => (
                        <span
                          className="classroom-role-mini-student"
                          key={student.id}
                        >
                          {student.name}
                        </span>
                      ))
                    : (
                        <span className="classroom-role-mini-student classroom-role-mini-student--empty">
                          미배정
                        </span>
                      )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {loaded ? (
        <button
          type="button"
          className="classroom-role-mini-add"
          onClick={() => setAddOpen(true)}
        >
          + 역할 추가
        </button>
      ) : null}

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
