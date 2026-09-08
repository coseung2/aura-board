"use client";

import { useEffect, useState } from "react";
import type { SongGuessCatalogCategory, SongGuessCatalogSegment, SongGuessCatalogSummary } from "@/lib/song-guess/catalog";
import type { SongGuessTeacherSetup } from "@/lib/song-guess/contracts";
import styles from "./SongGuessBoard.module.css";

export function SongGuessPoolPicker({ boardId, busy, onPrepared, onPreparingChange }: {
  boardId: string;
  busy: boolean;
  onPrepared: (setup: SongGuessTeacherSetup) => void;
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
        const value = await response.json() as SongGuessCatalogSummary;
        if (!Array.isArray(value.categories) || !Array.isArray(value.songs)) throw new Error("invalid_catalog");
        setCatalog(value);
      })
      .catch(() => { if (!controller.signal.aborted) setError("노래 풀을 불러오지 못했어요."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, retry]);

  const available = catalog?.songs.filter((song) => song.segments[segment] &&
    (categories.length === 0 || song.categories.some((category) => categories.includes(category)))) ?? [];
  const roundCount = Math.min(count, available.length);
  const countOptions = [...new Set([5, 10, 15, 20, 30, 50, Math.min(50, available.length), roundCount])]
    .filter((value) => value > 0 && value <= available.length).sort((left, right) => left - right);
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
      onPrepared(body.setup);
    } catch {
      setError("노래를 준비하지 못했어요.");
    } finally {
      setPreparing(false);
      onPreparingChange?.(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="노래 풀">
      <h2>노래 선택</h2>
      {loading ? <p role="status">노래 풀을 불러오는 중이에요…</p> : catalog && <>
        <fieldset className={styles.poolFieldset} disabled={disabled}>
          <legend>노래 분류</legend>
          <div className={styles.poolCategories}>
            <button type="button" className={styles.secondaryButton} aria-pressed={categories.length === 0} onClick={() => setCategories([])}>전체</button>
            {catalog.categories.map((category) => <button key={category.id} type="button"
              className={styles.secondaryButton} aria-pressed={categories.includes(category.id)}
              onClick={() => setCategories((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])}>
              {category.label}
            </button>)}
          </div>
        </fieldset>
        <div className={styles.poolControls}>
          <label className={styles.field}><span>듣기 구간</span>
            <select value={segment} disabled={disabled} onChange={(event) => setSegment(event.target.value as SongGuessCatalogSegment)}>
              <option value="highlight">하이라이트</option><option value="intro">도입</option>
            </select>
          </label>
          <label className={styles.field}><span>문제 수</span>
            <select value={roundCount} disabled={disabled || available.length === 0} onChange={(event) => setCount(Number(event.target.value))}>
              {available.length === 0 && <option value={0}>0문제</option>}
              {countOptions.map((value) => <option key={value} value={value}>{value}문제</option>)}
            </select>
          </label>
        </div>
        <div className={styles.poolActions}>
        <span className={styles.helperText}>{available.length === 0 ? "등록된 곡 없음" : `곡 풀 ${available.length}곡`}</span>
        <button className={styles.primaryButton} type="button" disabled={disabled || roundCount === 0} onClick={() => void prepare()}>
          {preparing ? "노래 준비 중…" : `${roundCount}문제 준비하기`}
        </button>
        </div>
      </>}
      {error && <><p className={styles.error} role="alert">{error}</p><button className={styles.secondaryButton} type="button" disabled={disabled} onClick={() => setRetry((current) => current + 1)}>다시 확인</button></>}
    </section>
  );
}
