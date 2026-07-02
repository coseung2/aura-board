"use client";

import { useMemo, useState } from "react";

const CATEGORY_LABEL: Record<string, string> = {
  bank: "📂 은행 업무",
  store: "📂 매점 운영",
  checks: "📂 제출 체크",
  inspections: "📂 아침 검사",
};

type CatalogEntry = {
  key: string;
  label: string;
  description: string;
  category: string;
  defaultRoles: readonly string[];
};

type Role = {
  key: string;
  labelKo: string;
  emoji: string | null;
  permissions: Record<string, boolean>;
};

type Props = {
  classroomId: string;
  role: Role;
  catalog: CatalogEntry[];
  onClose: () => void;
  onSaved: () => void;
};

export function RolePermissionModal({
  classroomId,
  role,
  catalog,
  onClose,
  onSaved,
}: Props) {
  const [perms, setPerms] = useState<Record<string, boolean>>({
    ...role.permissions,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g: Record<string, CatalogEntry[]> = {};
    for (const c of catalog) {
      (g[c.category] ??= []).push(c);
    }
    return g;
  }, [catalog]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/role-permissions/${role.key}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ permissions: perms }),
        }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setError(typeof msg === "string" ? msg : "저장 실패");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${role.labelKo} 권한`}
    >
      <div className="role-perm-modal">
        <header className="role-perm-modal-header">
          <h3>
            <span aria-hidden="true">{role.emoji ?? "•"}</span> {role.labelKo} 권한
          </h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>

        <div className="role-perm-modal-body">
          {Object.entries(grouped).map(([cat, entries]) => (
            <section key={cat} className="role-perm-group">
              <h4 className="role-perm-group-title">
                {CATEGORY_LABEL[cat] ?? cat}
              </h4>
              <ul className="role-perm-list">
                {entries.map((entry) => {
                  const id = `perm-${role.key}-${entry.key}`;
                  return (
                    <li key={entry.key} className="role-perm-row">
                      <label className="role-perm-label" htmlFor={id}>
                        <input
                          id={id}
                          type="checkbox"
                          checked={!!perms[entry.key]}
                          onChange={(e) =>
                            setPerms((p) => ({
                              ...p,
                              [entry.key]: e.target.checked,
                            }))
                          }
                          disabled={saving}
                        />
                        <span className="role-perm-label-main">
                          {entry.label}
                        </span>
                      </label>
                      <p className="role-perm-desc">{entry.description}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {error && <p className="role-perm-error">{error}</p>}

        <footer className="role-perm-modal-footer">
          <button
            type="button"
            className="role-perm-btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            취소
          </button>
          <button
            type="button"
            className="role-perm-btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </footer>
      </div>
    </div>
  );
}
