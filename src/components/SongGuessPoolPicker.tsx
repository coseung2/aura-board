"use client";

import { useEffect, useState } from "react";
import type {
  SongGuessCatalogCategory,
  SongGuessCatalogSegment,
  SongGuessCatalogSummary,
} from "@/lib/song-guess/catalog";
import type { SongGuessTeacherSetup } from "@/lib/song-guess/contracts";
import { estimateSongGuessDuration } from "@/lib/song-guess/setup-estimate";
import styles from "./SongGuessTeacher.module.css";

const SEGMENT_OPTIONS: { value: SongGuessCatalogSegment; label: string }[] = [
  { value: "highlight", label: "하이라이트" },
  { value: "intro", label: "도입" },
];

const SEGMENT_HINTS: Record<SongGuessCatalogSegment, string> = {
  highlight: "학생이 바로 알아볼 수 있는 대표 구간이에요.",
  intro: "곡의 도입부만 들려줘요. 난도가 올라가요.",
};

export function SongGuessPoolPicker({
  boardId,
  busy,
  onPrepared,
  onPreparingChange,
  onSetupLocked,
}: {
  boardId: string;
  busy: boolean;
  onPrepared: (setup: SongGuessTeacherSetup) => void | Promise<void>;
  onPreparingChange?: (preparing: boolean) => void;
  onSetupLocked?: () => void;
}) {
  const [catalog, setCatalog] = useState<SongGuessCatalogSummary | null>(null);
  const [categories, setCategories] = useState<SongGuessCatalogCategory[]>([]);
  const [segment, setSegment] = useState<SongGuessCatalogSegment>("highlight");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupLocked, setSetupLocked] = useState(false);
  const [retry, setRetry] = useState(0);
  const endpoint = `/api/song-guess/boards/${encodeURIComponent(boardId)}/catalog`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog_unavailable");
        const value = (await response.json()) as SongGuessCatalogSummary;
        if (!Array.isArray(value.categories) || !Array.isArray(value.songs)) {
          throw new Error("invalid_catalog");
        }
        setCatalog(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("노래 풀을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, retry]);

  const available =
    catalog?.songs.filter(
      (song) =>
        song.segments[segment] &&
        (categories.length === 0 ||
          song.categories.some((category) => categories.includes(category))),
    ) ?? [];
  const roundCount = Math.min(count, available.length);
  const countOptions = [
    ...new Set([
      5,
      10,
      15,
      20,
      30,
      50,
      Math.min(50, available.length),
      roundCount,
    ]),
  ]
    .filter((value) => value > 0 && value <= available.length)
    .sort((left, right) => left - right);
  const disabled = busy || preparing;
  const totalPoolSize = catalog?.songs.length ?? 0;
  const poolRatio =
    totalPoolSize === 0
      ? 0
      : Math.max(2, Math.round((available.length / totalPoolSize) * 100));
  const estimate = estimateSongGuessDuration(roundCount);

  async function prepare() {
    if (disabled || roundCount < 1) return;
    setPreparing(true);
    onPreparingChange?.(true);
    setError(null);
    setSetupLocked(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categories, segment, count: roundCount }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "prepare_failed");
      await onPrepared(body.setup as SongGuessTeacherSetup);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "song_guess_setup_locked") {
        setSetupLocked(true);
        setError("진행 중인 노래 맞히기 게임이 있어 새 문제를 준비할 수 없어요. 방 목록에서 기존 게임을 끝낸 뒤 다시 준비해 주세요.");
      } else {
        setError("노래를 준비하지 못했어요.");
      }
    } finally {
      setPreparing(false);
      onPreparingChange?.(false);
    }
  }

  function toggleCategory(category: SongGuessCatalogCategory) {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((id) => id !== category)
        : [...current, category],
    );
  }

  return (
    <section className={styles.setupCard} aria-label="노래 선택">
      <h2>노래 선택</h2>
      {loading ? (
        <div className={styles.setupLoading} role="status">
          노래 풀을 불러오는 중이에요…
        </div>
      ) : (
        catalog && (
          <>
            <fieldset className={styles.categoryFieldset} disabled={disabled}>
              <legend className={styles.categoryLegendRow}>
                <strong>1 · 노래 분류</strong>
                <span>복수 선택 가능</span>
              </legend>
              <div className={styles.categoryGrid}>
                <button
                  type="button"
                  className={styles.categoryButton}
                  aria-pressed={categories.length === 0}
                  onClick={() => setCategories([])}
                >
                  전체
                  {categories.length === 0 && (
                    <span className={styles.categoryCheck} aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
                {catalog.categories.map((category) => {
                  const selected = categories.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={styles.categoryButton}
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category.id)}
                    >
                      {category.label}
                      {selected && (
                        <span className={styles.categoryCheck} aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className={styles.setupControls}>
              <fieldset className={styles.choiceFieldset} disabled={disabled}>
                <legend className={styles.setupLabel}>2 · 듣기 구간</legend>
                <div className={styles.choiceRow}>
                  {SEGMENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={styles.choiceButton}
                      aria-pressed={segment === option.value}
                      onClick={() => setSegment(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className={styles.choiceHint}>{SEGMENT_HINTS[segment]}</p>
              </fieldset>
              <fieldset
                className={styles.choiceFieldset}
                disabled={disabled || available.length === 0}
              >
                <legend className={styles.setupLabel}>3 · 문제 수</legend>
                <div className={styles.choiceRow}>
                  {countOptions.length === 0 ? (
                    <span className={styles.choiceHint}>선택한 조건에 맞는 곡이 없어요.</span>
                  ) : (
                    countOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={styles.choiceButton}
                        aria-pressed={roundCount === value}
                        onClick={() => setCount(value)}
                      >
                        {value}문제
                      </button>
                    ))
                  )}
                </div>
              </fieldset>
            </div>

            <div className={styles.poolSummary}>
              <div className={styles.poolSummaryHead}>
                <span className={styles.setupLabel}>선택 조건에서 출제 가능한 곡</span>
                <strong className={styles.poolTotal}>
                  {available.length === 0 ? "0곡" : `${available.length}곡`}
                </strong>
              </div>
              <div
                className={styles.poolTrack}
                role="img"
                aria-label={`전체 ${totalPoolSize}곡 중 조건에 맞는 ${available.length}곡`}
              >
                <span className={styles.poolFill} style={{ inlineSize: `${poolRatio}%` }} />
              </div>
              {estimate && (
                <p className={styles.poolEstimate}>
                  예상 진행 <strong>{estimate.label}</strong>
                  <span>{`곡 풀 ${available.length}곡에서 ${roundCount}문제 무작위 구성`}</span>
                </p>
              )}
            </div>
            <div className={styles.setupActions}>
              <span className={styles.poolCount}>
                {available.length === 0 ? "등록된 곡 없음" : `곡 풀 ${available.length}곡`}
              </span>
              <button
                className={styles.prepareButton}
                type="button"
                disabled={disabled || roundCount === 0}
                onClick={() => void prepare()}
              >
                {preparing ? "노래 준비 중…" : `${roundCount}문제 준비하기`}
              </button>
            </div>
          </>
        )
      )}
      {error && (
        <>
          <p className={styles.setupError} role="alert">
            {error}
          </p>
          <button
            className={styles.retryButton}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (setupLocked && onSetupLocked) {
                onSetupLocked();
                return;
              }
              setRetry((current) => current + 1);
            }}
          >
            {setupLocked && onSetupLocked ? "방 목록으로 돌아가기" : "다시 확인"}
          </button>
        </>
      )}
    </section>
  );
}
