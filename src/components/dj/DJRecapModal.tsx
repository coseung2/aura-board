"use client";

import { useEffect, useMemo, useState } from "react";

type Song = {
  key: string;
  title: string;
  linkImage: string | null;
  linkUrl: string | null;
  videoId: string | null;
  plays: number;
  firstSubmitter: string | null;
};

type Submitter = {
  id: string | null;
  name: string;
  plays: number;
  uniqueSongs: number;
};

type RecapData = {
  board: { id: string; title: string };
  period: { from: string; to: string; label: string };
  totals: {
    plays: number;
    uniqueSongs: number;
    uniqueSubmitters: number;
    totalMinutes: number;
  };
  topSongs: Song[];
  topSubmitters: Submitter[];
  submittersHidden?: boolean;
  byDay: Array<{ date: string; plays: number }>;
  spotlight: { topSong: Song | null; topSubmitter: Submitter | null };
};

type Props = {
  boardId: string;
  boardTitle: string;
  onClose: () => void;
};

/**
 * DJ 보드 월말 리캡. 교사가 헤더의 📊 버튼을 누르면 열리고 학생도 열람 가능.
 * 기본: 이번 달. 이전 달 ↔ 다음 달 네비게이션.
 */
export function DJRecapModal({ boardId, boardTitle, onClose }: Props) {
  const [month, setMonth] = useState<string>(currentMonth());
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const url = `/api/dj/recap?boardId=${encodeURIComponent(boardId)}&month=${encodeURIComponent(month)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as RecapData;
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "불러올 수 없어요");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, month]);

  const maxByDay = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.byDay.map((d) => d.plays));
  }, [data]);

  return (
    <div
      className="dj-recap-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="DJ 월말 리캡"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dj-recap-modal">
        <header className="dj-recap-head">
          <div>
            <div className="dj-recap-eyebrow">📊 이달의 리캡</div>
            <h2 className="dj-recap-title">{boardTitle}</h2>
          </div>
          <button type="button" className="dj-recap-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className="dj-recap-monthbar">
          <button
            type="button"
            className="dj-recap-monthbtn"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="이전 달"
          >
            ← {monthLabel(shiftMonth(month, -1))}
          </button>
          <div className="dj-recap-monthpill">{monthLabel(month)}</div>
          <button
            type="button"
            className="dj-recap-monthbtn"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
            aria-label="다음 달"
          >
            {monthLabel(shiftMonth(month, 1))} →
          </button>
        </div>

        {loading ? (
          <div className="dj-recap-empty">불러오는 중…</div>
        ) : error ? (
          <div className="dj-recap-empty">{error}</div>
        ) : !data ? null : data.totals.plays === 0 ? (
          <div className="dj-recap-empty">
            <div style={{ fontSize: 48 }}>🎵</div>
            <div>이 달에는 아직 재생된 곡이 없어요.</div>
          </div>
        ) : (
          <div className="dj-recap-body">
            {/* 상단: 총 재생 / 고유 곡 / 총 시간 3개 big number */}
            <div className="dj-recap-stats">
              <Stat label="총 재생" value={`${data.totals.plays}`} unit="곡" />
              <Stat label="고유 곡" value={`${data.totals.uniqueSongs}`} unit="개" />
              <Stat label="참여" value={`${data.totals.uniqueSubmitters}`} unit="명" />
              {data.totals.totalMinutes > 0 ? (
                <Stat label="총 재생 시간" value={`${data.totals.totalMinutes}`} unit="분" />
              ) : null}
            </div>

            {/* 스포트라이트 */}
            {data.spotlight.topSong || data.spotlight.topSubmitter ? (
              <div className="dj-recap-spotlight">
                {data.spotlight.topSong ? (
                  <div className="dj-recap-spot dj-recap-spot-song">
                    <div className="dj-recap-spot-label">🎵 가장 많이 들은 곡</div>
                    {data.spotlight.topSong.linkImage ? (
                      <img
                        className="dj-recap-spot-thumb"
                        src={data.spotlight.topSong.linkImage}
                        alt=""
                        width={120}
                        height={68}
                      />
                    ) : (
                      <div className="dj-recap-spot-thumb dj-recap-spot-thumb-fallback">♪</div>
                    )}
                    <div className="dj-recap-spot-title" title={data.spotlight.topSong.title}>
                      {data.spotlight.topSong.title}
                    </div>
                    <div className="dj-recap-spot-meta">
                      {data.spotlight.topSong.plays}회 재생
                    </div>
                  </div>
                ) : null}
                {data.spotlight.topSubmitter ? (
                  <div className="dj-recap-spot dj-recap-spot-dj">
                    <div className="dj-recap-spot-label">🏆 이달의 DJ</div>
                    <div className="dj-recap-spot-avatar">
                      {data.spotlight.topSubmitter.name[0]}
                    </div>
                    <div className="dj-recap-spot-title">{data.spotlight.topSubmitter.name}</div>
                    <div className="dj-recap-spot-meta">
                      {data.spotlight.topSubmitter.plays}회 · {data.spotlight.topSubmitter.uniqueSongs}곡
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Top 곡 테이블 */}
            <section className="dj-recap-section">
              <h3 className="dj-recap-sectiontitle">Top 10 곡</h3>
              <ul className="dj-recap-songlist">
                {data.topSongs.map((song, i) => (
                  <li key={song.key} className="dj-recap-songrow">
                    <span className={`dj-recap-pos${i < 3 ? " top" : ""}`}>{i + 1}</span>
                    {song.linkImage ? (
                      <img
                        className="dj-recap-songthumb"
                        src={song.linkImage}
                        alt=""
                        width={56}
                        height={32}
                      />
                    ) : (
                      <div className="dj-recap-songthumb dj-recap-spot-thumb-fallback">♪</div>
                    )}
                    <div className="dj-recap-songinfo">
                      <div className="dj-recap-songtitle">{song.title}</div>
                      {song.firstSubmitter ? (
                        <div className="dj-recap-songsub">첫 신청 {song.firstSubmitter}</div>
                      ) : null}
                    </div>
                    <span className="dj-recap-songplays">{song.plays}회</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 제출자 랭킹 */}
            <section className="dj-recap-section">
              <h3 className="dj-recap-sectiontitle">신청 TOP</h3>
              <ul className="dj-recap-ranking">
                {data.submittersHidden ? (
                  <li className="dj-recap-empty">
                    익명 보드에서는 신청자 순위를 숨겨요.
                  </li>
                ) : (
                  data.topSubmitters.map((s, i) => (
                    <li key={`${s.id ?? s.name}`} className="dj-recap-rankrow">
                      <span className={`dj-recap-pos${i < 3 ? " top" : ""}`}>{i + 1}</span>
                      <span className={`dj-recap-avatar${i === 0 ? " top" : ""}`}>{s.name[0]}</span>
                      <span className="dj-recap-rankname">{s.name}</span>
                      <span className="dj-recap-rankcount">{s.plays}회 · {s.uniqueSongs}곡</span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            {/* 일별 bar */}
            <section className="dj-recap-section">
              <h3 className="dj-recap-sectiontitle">일별 재생</h3>
              <div className="dj-recap-bars">
                {data.byDay.map((d) => {
                  const h = Math.round((d.plays / maxByDay) * 100);
                  return (
                    <div
                      key={d.date}
                      className="dj-recap-bar"
                      title={`${d.date.slice(5)} · ${d.plays}회`}
                    >
                      <div
                        className="dj-recap-bar-fill"
                        style={{ height: `${Math.max(3, h)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="dj-recap-bars-xaxis">
                <span>{data.byDay[0]?.date.slice(5)}</span>
                <span>{data.byDay[data.byDay.length - 1]?.date.slice(5)}</span>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="dj-recap-stat">
      <div className="dj-recap-stat-value">
        {value}
        <span className="dj-recap-stat-unit">{unit}</span>
      </div>
      <div className="dj-recap-stat-label">{label}</div>
    </div>
  );
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${parseInt(m!, 10)}월`;
}
