"use client";

import { useState } from "react";
import type { SpeciesDTO, StudentPlantDTO } from "@/types/plant";

interface Props {
  boardId: string;
  species: SpeciesDTO[];
  onStart: (plant: StudentPlantDTO) => void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
};
const SEASON_LABEL: Record<string, string> = {
  spring: "봄",
  summer: "여름",
  fall: "가을",
  winter: "겨울",
  all: "사계절",
};

export function PlantSelectStep({ boardId, species, onStart }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validNickname = nickname.trim().length >= 1 && nickname.trim().length <= 20;

  async function start() {
    if (!selected || !validNickname || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/student-plants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          speciesId: selected,
          nickname: nickname.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "시작 실패");
      }
      const j = await res.json();
      // Server returns minimal; refetch full plant details from /plant-journal for consistency
      const refetch = await fetch(`/api/boards/${boardId}/plant-journal`).then((r) => r.json());
      if (refetch?.myPlant) {
        onStart(refetch.myPlant as StudentPlantDTO);
      } else if (j?.studentPlant) {
        onStart(j.studentPlant as StudentPlantDTO);
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  if (species.length === 0) {
    return (
      <div className="plant-select">
        <h2 className="plant-select-title">아직 선택할 식물이 없어요</h2>
        <p className="plant-select-sub">담임 선생님께 식물 목록 설정을 부탁드려요.</p>
      </div>
    );
  }

  return (
    <div className="plant-select">
      <h2 className="plant-select-title">어떤 식물을 키울까요?</h2>
      <p className="plant-select-sub">한 종을 골라 나만의 별명을 지어 주세요.</p>
      <div className="plant-species-grid" role="radiogroup" aria-label="식물 선택">
        {species.map((sp) => (
          <button
            key={sp.id}
            type="button"
            className="plant-species-card"
            data-selected={selected === sp.id}
            role="radio"
            aria-checked={selected === sp.id}
            onClick={() => setSelected(sp.id)}
          >
            <span className="plant-species-emoji" aria-hidden>{sp.emoji}</span>
            <span className="plant-species-name">{sp.nameKo}</span>
            <span className="plant-species-meta">
              <span className="plant-species-badge">{DIFFICULTY_LABEL[sp.difficulty] ?? sp.difficulty}</span>
              <span className="plant-species-badge">{SEASON_LABEL[sp.season] ?? sp.season}</span>
            </span>
            {sp.notes && <span className="plant-species-meta">{sp.notes}</span>}
          </button>
        ))}
      </div>
      <div className="plant-select-bar">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="별명 (예: 방울이, 새싹이)"
          maxLength={20}
          aria-label="별명"
        />
        <button
          type="button"
          className="ds-btn-primary"
          onClick={start}
          disabled={!selected || !validNickname || busy}
        >
          {busy ? "저장 중…" : "시작"}
        </button>
      </div>
      {err && <p className="plant-error">시작 실패: {err}</p>}
    </div>
  );
}
