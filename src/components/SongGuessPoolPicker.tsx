"use client";

import { useEffect, useState } from "react";
import type {
  SongGuessCatalogCategory,
  SongGuessCatalogSegment,
  SongGuessCatalogSummary,
} from "@/lib/song-guess/catalog";
import type { SongGuessTeacherSetup } from "@/lib/song-guess/contracts";
import styles from "./SongGuessTeacher.module.css";

export function SongGuessPoolPicker({
  boardId,
  busy,
  onPrepared,
  onPreparingChange,
}: {
  boardId: string;
  busy: boolean;
  onPrepared: (setup: SongGuessTeacherSetup) => void | Promise<void>;
  onPreparingChange?: (preparing: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<SongGuessCatalogSummary | null>(null);
  const [categories, setCategories] = useState<SongGuessCatalogCategory[]>([]);
  const [segment, setSegment] = useState<SongGuessCatalogSegment>("highlight");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function prepare() {
    if (disabled || roundCount < 1) return;
    setPreparing(true);
    onPreparingChange?.(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categories, segment, count: roundCount }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "prepare_failed");
      await onPrepared(body.setup as SongGuessTeacherSetup);
    } catch {
      setError("노래를 준비하지 못했어요.");
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
                <strong>노래 분류</strong>
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
              <label className={styles.selectField}>
                <span>듣기 구간</span>
                <select
                  value={segment}
                  disabled={disabled}
                  onChange={(event) =>
                    setSegment(event.target.value as SongGuessCatalogSegment)
                  }
                >
                  <option value="highlight">하이라이트</option>
                  <option value="intro">도입</option>
                </select>
              </label>
              <label className={styles.selectField}>
                <span>문제 수</span>
                <select
                  value={roundCount}
                  disabled={disabled || available.length === 0}
                  onChange={(event) => setCount(Number(event.target.value))}
                >
                  {available.length === 0 && <option value={0}>0문제</option>}
                  {countOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}문제
                    </option>
                  ))}
                </select>
              </label>
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
            onClick={() => setRetry((current) => current + 1)}
          >
            다시 확인
          </button>
        </>
      )}
    </section>
  );
}
