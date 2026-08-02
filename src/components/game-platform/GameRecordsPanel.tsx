"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  GameRecordDto,
  GameRecordRange,
  OfficialGameKind,
} from "@/lib/game-platform/contracts";
import {
  GAME_RECORD_RANGES,
  OFFICIAL_GAME_KINDS,
} from "@/lib/game-platform/contracts";
import { OFFICIAL_GAME_CATALOG } from "@/lib/game-platform/catalog";
import { formatGameMetrics } from "@/lib/game-platform/metrics";
import styles from "./game-platform.module.css";

type RecordsResponse = {
  schemaVersion: 1;
  appliedFilter: {
    gameKind: OfficialGameKind | "all";
    range: GameRecordRange;
    limit: number;
  };
  summary: {
    totalPlays: number;
    completedCount: number;
    bestScore: number | null;
    latestCompletedAt: string | null;
  };
  facets: Partial<Record<OfficialGameKind, number>>;
  records: GameRecordDto[];
  nextCursor: string | null;
};

export type GameRecordsPanelProps = {
  initialGameKind?: OfficialGameKind | "all";
  initialRange?: GameRecordRange;
  pageSize?: number;
  syncUrl?: boolean;
};

function outcomeLabel(outcome: GameRecordDto["outcome"]): string {
  switch (outcome) {
    case "win": return "승리";
    case "loss": return "패배";
    case "draw": return "무승부";
    case "completed": return "완료";
    case "forfeit": return "기권";
    case "abandoned": return "나감";
    case "host-ended": return "진행자 종료";
  }
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs == null) return null;
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

export function GameRecordsPanel({
  initialGameKind = "all",
  initialRange = "30d",
  pageSize = 20,
  syncUrl = true,
}: GameRecordsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [gameKind, setGameKind] = useState<OfficialGameKind | "all">(initialGameKind);
  const [range, setRange] = useState<GameRecordRange>(initialRange);
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [records, setRecords] = useState<GameRecordDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const updateUrl = useCallback(
    (nextKind: OfficialGameKind | "all", nextRange: GameRecordRange) => {
      if (!syncUrl) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("category", "play");
      params.set("playTab", "records");
      params.set("game", nextKind);
      params.set("range", nextRange);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, syncUrl],
  );

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      const requestId = ++requestRef.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          gameKind,
          range,
          limit: String(pageSize),
        });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/student/game-records?${params.toString()}`, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const body = (await response.json().catch(() => null)) as RecordsResponse | null;
        if (!response.ok || !body) throw new Error("records_request_failed");
        if (requestId !== requestRef.current) return;
        setData(body);
        setRecords((current) => (append ? [...current, ...body.records] : body.records));
        setNextCursor(body.nextCursor);
      } catch {
        if (requestId !== requestRef.current) return;
        setError("전적을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [gameKind, pageSize, range],
  );

  useEffect(() => {
    setRecords([]);
    setNextCursor(null);
    void load(null, false);
  }, [load]);

  const latestLabel = useMemo(() => {
    if (!data?.summary.latestCompletedAt) return "없음";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(data.summary.latestCompletedAt));
  }, [data?.summary.latestCompletedAt]);

  function chooseKind(next: OfficialGameKind | "all") {
    setGameKind(next);
    updateUrl(next, range);
  }

  function chooseRange(next: GameRecordRange) {
    setRange(next);
    updateUrl(gameKind, next);
  }

  return (
    <section className={styles.recordsPanel} aria-labelledby="game-records-title">
      <p className={styles.eyebrow}>My Records</p>
      <h2 id="game-records-title">나의 전적</h2>
      <div className={styles.filters} aria-label="게임 필터">
        <button
          type="button"
          className={styles.filterButton}
          data-active={gameKind === "all"}
          onClick={() => chooseKind("all")}
        >
          전체
        </button>
        {OFFICIAL_GAME_KINDS.map((kind) => (
          <button
            type="button"
            className={styles.filterButton}
            data-active={gameKind === kind}
            onClick={() => chooseKind(kind)}
            key={kind}
          >
            {OFFICIAL_GAME_CATALOG[kind].label}
            {data?.facets[kind] != null ? ` ${data.facets[kind]}` : ""}
          </button>
        ))}
      </div>
      <div className={styles.filters} aria-label="기간 필터">
        {GAME_RECORD_RANGES.map((value) => (
          <button
            type="button"
            className={styles.filterButton}
            data-active={range === value}
            onClick={() => chooseRange(value)}
            key={value}
          >
            {value === "all" ? "전체 기간" : value}
          </button>
        ))}
      </div>

      <div className={styles.summaryGrid} aria-label="전적 요약">
        <div className={styles.summaryCard}>
          <span>플레이</span>
          <strong>{data?.summary.totalPlays ?? 0}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>완료</span>
          <strong>{data?.summary.completedCount ?? 0}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>최고 점수</span>
          <strong>
            {data?.summary.bestScore == null
              ? "—"
              : data.summary.bestScore.toLocaleString("ko-KR")}
          </strong>
        </div>
        <div className={styles.summaryCard}>
          <span>최근 플레이</span>
          <strong>{latestLabel}</strong>
        </div>
      </div>

      {loading ? (
        <div className={styles.recordList} aria-label="전적 불러오는 중">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.secondaryButton} onClick={() => void load(null, false)}>
            다시 시도
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className={styles.empty}>
          <strong>아직 이 조건의 전적이 없어요.</strong>
          <p className={styles.muted}>게임을 끝내면 결과가 여기에 안전하게 기록됩니다.</p>
        </div>
      ) : (
        <div className={styles.recordList}>
          {records.map((record) => {
            const metricLines = formatGameMetrics(record.gameKind, record.metrics);
            const duration = formatDuration(record.durationMs);
            return (
              <article className={styles.recordRow} key={record.id}>
                <div>
                  <p className={styles.recordTitle}>
                    {OFFICIAL_GAME_CATALOG[record.gameKind].label} · {record.boardTitle}
                  </p>
                  <p className={styles.recordMeta}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(record.completedAt))}
                    {duration ? ` · ${duration}` : ""}
                    {record.score == null ? "" : ` · ${record.score.toLocaleString("ko-KR")}점`}
                  </p>
                  {metricLines.map((line) => (
                    <span className={styles.badge} key={line}>{line}</span>
                  ))}
                </div>
                <span className={styles.recordOutcome}>{outcomeLabel(record.outcome)}</span>
              </article>
            );
          })}
        </div>
      )}

      {nextCursor && !loading ? (
        <div className={styles.resultActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={loadingMore}
            onClick={() => void load(nextCursor, true)}
          >
            {loadingMore ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
