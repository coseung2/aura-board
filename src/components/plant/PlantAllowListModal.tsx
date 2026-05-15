"use client";

import { useEffect, useState } from "react";
import type { SpeciesDTO } from "@/types/plant";

interface Props {
  open: boolean;
  allSpecies: SpeciesDTO[];
  initialAllowed: Set<string>;
  classroomId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function PlantAllowListModal({
  open,
  allSpecies,
  initialAllowed,
  classroomId,
  onClose,
  onSaved,
}: Props) {
  const [checked, setChecked] = useState<Set<string>>(initialAllowed);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setChecked(new Set(initialAllowed));
  }, [open, initialAllowed]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  }
  function toggleAll() {
    if (checked.size === allSpecies.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(allSpecies.map((s) => s.id)));
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/species`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speciesIds: Array.from(checked) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "저장 실패");
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="plant-modal-backdrop" role="dialog" aria-modal="true" aria-label="식물 허용 목록">
      <div className="plant-modal">
        <h3>식물 허용 목록</h3>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>학생이 고를 수 있는 식물을 선택해 주세요.</p>
        <button
          type="button"
          onClick={toggleAll}
          style={{ fontSize: 12, color: "var(--color-accent)", border: 0, background: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
        >
          {checked.size === allSpecies.length ? "전체 해제" : "전체 선택"}
        </button>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {allSpecies.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checked.has(s.id)}
                onChange={() => toggle(s.id)}
              />
              <span style={{ fontSize: 22 }} aria-hidden>{s.emoji}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{s.nameKo}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  난이도 {s.difficulty} · {s.season}
                </div>
              </div>
            </label>
          ))}
        </div>
        {err && <p className="plant-error">{err}</p>}
        <div className="plant-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>취소</button>
          <button type="button" className="primary" onClick={save} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
