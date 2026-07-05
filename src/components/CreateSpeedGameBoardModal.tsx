"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WordSet = {
  id: string;
  key?: string;
  name: string;
  locale: "ko" | "en";
  keywords: string[];
  updatedAt?: string;
};

type ClassroomItem = {
  id: string;
  name: string;
  studentCount: number;
};

type Props = {
  classrooms: ClassroomItem[];
  userTier?: "free" | "pro";
  onClose: () => void;
  onBack?: () => void;
};

const ANSWER_MODES: { value: "exact" | "normalize-space" | "teacher-approval"; label: string; hint: string }[] = [
  { value: "exact", label: "정확히 일치", hint: "공백/띄어쓰기까지 같아야 정답" },
  { value: "normalize-space", label: "띄어쓰기 무시", hint: "공백만 무시하고 비교" },
  { value: "teacher-approval", label: "교사 승인", hint: "학생 제출 후 교사가 수동 판정" },
];

function parseKeywords(text: string): string[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function validateKeywords(words: string[]): string | null {
  if (words.length === 0) return "최소 1개의 단어를 입력하세요.";
  if (words.length > 100) return "단어는 최대 100개까지 입력할 수 있어요.";
  for (const word of words) {
    if (word.length > 80) return `단어는 80자 이내여야 해요: ${word.slice(0, 20)}…`;
  }
  return null;
}

export function CreateSpeedGameBoardModal({
  classrooms,
  onClose,
  onBack,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("스피드게임");
  const [classroomId, setClassroomId] = useState<string>("");

  const [tab, setTab] = useState<"system" | "my" | "direct">("direct");
  const [systemSets, setSystemSets] = useState<WordSet[]>([]);
  const [mySets, setMySets] = useState<WordSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [directText, setDirectText] = useState("");
  const [saveSetTitle, setSaveSetTitle] = useState("");
  const [savingSet, setSavingSet] = useState(false);

  const [answerMode, setAnswerMode] = useState<"exact" | "normalize-space" | "teacher-approval">("normalize-space");
  const [baseScore, setBaseScore] = useState(100);
  const [minScore, setMinScore] = useState(10);
  const [rankBonusFirst, setRankBonusFirst] = useState(50);
  const [rankBonusSecond, setRankBonusSecond] = useState(30);
  const [rankBonusThird, setRankBonusThird] = useState(10);

  useEffect(() => {
    let cancelled = false;
    setSetsLoading(true);
    fetch("/api/speed-game/word-sets", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSystemSets((data.systemSets ?? []) as WordSet[]);
        setMySets((data.mySets ?? []) as WordSet[]);
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setSetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = useMemo(() => {
    if (tab !== "direct" && selectedSetId) {
      const list = tab === "system" ? systemSets : mySets;
      return list.find((s) => s.id === selectedSetId) ?? null;
    }
    return null;
  }, [tab, selectedSetId, systemSets, mySets]);

  const effectiveKeywords = useMemo(() => {
    if (tab === "direct") return parseKeywords(directText);
    return selectedSet?.keywords ?? [];
  }, [tab, directText, selectedSet]);

  function loadSelectedSetIntoDirect() {
    if (selectedSet) {
      setDirectText(selectedSet.keywords.join("\n"));
      setTab("direct");
      setSelectedSetId(null);
    }
  }

  async function saveDirectAsMySet() {
    const words = parseKeywords(directText);
    const validationError = validateKeywords(words);
    if (validationError) {
      setError(validationError);
      return;
    }
    const name = saveSetTitle.trim() || "내 단어 세트";
    setSavingSet(true);
    setError(null);
    try {
      const res = await fetch("/api/speed-game/word-sets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, keywords: words }),
      });
      if (!res.ok) {
        setError(`단어 세트 저장 실패: ${await res.text()}`);
        return;
      }
      const data = (await res.json()) as { wordSet?: WordSet };
      if (data.wordSet) {
        setMySets((prev) => [data.wordSet!, ...prev]);
        setTab("my");
        setSelectedSetId(data.wordSet.id);
        setSaveSetTitle("");
      }
    } catch (e) {
      setError("단어 세트 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingSet(false);
    }
  }

  async function submit() {
    if (!classroomId) {
      setError("학급을 선택해야 합니다.");
      return;
    }
    const keywords = effectiveKeywords;
    const validationError = validateKeywords(keywords);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "스피드게임",
          layout: "speed-game",
          category: "PLAY",
          classroomId,
          speedGameConfig: {
            sourceWordSetId: selectedSet?.id ?? null,
            keywords,
            answerMode,
            baseScore,
            minScore,
            rankBonusFirst,
            rankBonusSecond,
            rankBonusThird,
          },
        }),
      });
      if (!res.ok) {
        setError(`보드 생성 실패: ${await res.text()}`);
        return;
      }
      const { board } = (await res.json()) as { board: { slug: string } };
      router.push(`/board/${board.slug}`);
    } catch (e) {
      setError("보드 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const renderWordSetList = (sets: WordSet[]) => {
    if (sets.length === 0) {
      return <p className="create-board-hint">등록된 단어 세트가 없어요.</p>;
    }
    return (
      <div className="layout-picker" role="radiogroup" aria-label="단어 세트 선택">
        {sets.map((set) => (
          <button
            key={set.id}
            type="button"
            className={`layout-option${selectedSetId === set.id ? " layout-option-selected" : ""}`}
            onClick={() => setSelectedSetId(set.id)}
            role="radio"
            aria-checked={selectedSetId === set.id}
            disabled={busy}
          >
            <span className="layout-option-emoji">📚</span>
            <span className="layout-option-label">{set.name}</span>
            <span className="layout-option-desc">
              {set.keywords.length}개 단어
              {set.locale ? ` · ${set.locale.toUpperCase()}` : ""}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal create-board-modal">
        <div className="modal-header">
          <h2 className="modal-title">스피드게임 만들기</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}

          <label className="modal-field-label" htmlFor="speed-game-title">
            보드 이름
          </label>
          <input
            id="speed-game-title"
            type="text"
            className="modal-input"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            disabled={busy}
            maxLength={200}
          />

          <label className="modal-field-label" htmlFor="speed-game-classroom">
            학급 <span className="speed-game-required">*</span>
          </label>
          <select
            id="speed-game-classroom"
            className="modal-select"
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            disabled={busy}
          >
            <option value="">학급 선택</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (학생 {c.studentCount}명)
              </option>
            ))}
          </select>

          <div className="speed-game-section">
            <span className="modal-field-label">단어 출처</span>
            <div className="speed-game-tabs" role="tablist">
              {[
                { key: "direct", label: "직접 입력" },
                { key: "system", label: "시스템 세트" },
                { key: "my", label: "내 세트" },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`speed-game-tab${tab === t.key ? " is-active" : ""}`}
                  onClick={() => {
                    setTab(t.key as typeof tab);
                    setSelectedSetId(null);
                  }}
                  role="tab"
                  aria-selected={tab === t.key}
                  disabled={busy}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {setsLoading && <p className="create-board-hint">불러오는 중…</p>}

            {tab === "direct" && (
              <div className="speed-game-direct">
                <textarea
                  className="modal-textarea"
                  rows={8}
                  value={directText}
                  onChange={(e) => setDirectText(e.target.value)}
                  placeholder="단어를 한 줄에 하나씩 입력하세요.&#10;예: 사과&#10;바나나"
                  disabled={busy}
                />
                <div className="speed-game-direct-actions">
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="새 세트 이름"
                    value={saveSetTitle}
                    onChange={(e) => setSaveSetTitle(e.target.value)}
                    disabled={busy || savingSet}
                  />
                  <button
                    type="button"
                    className="modal-btn-submit"
                    onClick={saveDirectAsMySet}
                    disabled={busy || savingSet || effectiveKeywords.length === 0}
                  >
                    {savingSet ? "저장 중…" : "내 세트로 저장"}
                  </button>
                </div>
              </div>
            )}

            {tab === "system" && !setsLoading && renderWordSetList(systemSets)}
            {tab === "my" && !setsLoading && renderWordSetList(mySets)}

            {selectedSet && tab !== "direct" && (
              <div className="speed-game-set-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={loadSelectedSetIntoDirect}
                  disabled={busy}
                >
                  직접 입력에 불러오기
                </button>
              </div>
            )}

            <p className="speed-game-word-count">
              선택된 단어: <strong>{effectiveKeywords.length}</strong>개
            </p>
          </div>

          <div className="speed-game-section">
            <span className="modal-field-label">정답 채점 방식</span>
            <fieldset className="speed-game-radio-group">
              {ANSWER_MODES.map((mode) => (
                <label key={mode.value} className="speed-game-radio">
                  <input
                    type="radio"
                    name="answerMode"
                    value={mode.value}
                    checked={answerMode === mode.value}
                    onChange={() => setAnswerMode(mode.value)}
                    disabled={busy}
                  />
                  <span>
                    <strong>{mode.label}</strong>
                    <small>{mode.hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>

          <div className="speed-game-section">
            <span className="modal-field-label">점수 설정</span>
            <div className="speed-game-score-grid">
              <label>
                기본 점수
                <input
                  type="number"
                  min={0}
                  value={baseScore}
                  onChange={(e) => setBaseScore(Math.max(0, Number(e.target.value) || 0))}
                  disabled={busy}
                />
              </label>
              <label>
                최소 점수
                <input
                  type="number"
                  min={0}
                  value={minScore}
                  onChange={(e) => setMinScore(Math.max(0, Number(e.target.value) || 0))}
                  disabled={busy}
                />
              </label>
              <label>
                1등 본너스
                <input
                  type="number"
                  min={0}
                  value={rankBonusFirst}
                  onChange={(e) => setRankBonusFirst(Math.max(0, Number(e.target.value) || 0))}
                  disabled={busy}
                />
              </label>
              <label>
                2등 본너스
                <input
                  type="number"
                  min={0}
                  value={rankBonusSecond}
                  onChange={(e) => setRankBonusSecond(Math.max(0, Number(e.target.value) || 0))}
                  disabled={busy}
                />
              </label>
              <label>
                3등 본너스
                <input
                  type="number"
                  min={0}
                  value={rankBonusThird}
                  onChange={(e) => setRankBonusThird(Math.max(0, Number(e.target.value) || 0))}
                  disabled={busy}
                />
              </label>
            </div>
          </div>

          <div className="modal-actions">
            {onBack && (
              <button type="button" className="modal-btn-cancel" onClick={onBack} disabled={busy}>
                ← 뒤로
              </button>
            )}
            <button
              type="button"
              className="modal-btn-submit"
              onClick={submit}
              disabled={busy || !classroomId}
            >
              {busy ? "만드는 중…" : "보드 만들기"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
