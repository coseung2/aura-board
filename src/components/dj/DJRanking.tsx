"use client";

import { useEffect, useState } from "react";

type Song = {
  linkUrl: string;
  linkImage: string | null;
  title: string;
  count: number;
};

type Submitter = {
  key: string;
  name: string;
  count: number;
  isStudent: boolean;
};

type Props = {
  boardId: string;
  /** Bumped by parent whenever the queue mutates — re-triggers fetch. */
  refreshKey: number;
};

export function DJRanking({ boardId, refreshKey }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [submittersHidden, setSubmittersHidden] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/boards/${boardId}/queue/ranking`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSongs(data.songs ?? []);
        setSubmitters(data.submitters ?? []);
        setSubmittersHidden(data.submittersHidden === true);
      } catch {
        // silent — sidebar is non-critical
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, refreshKey]);

  const monthLabel = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
  });

  return (
    <aside className="dj-ranking" aria-label="이번달 랭킹">
      <section className="dj-ranking-section">
        <h3 className="dj-ranking-title">🎵 많이 재생된 곡</h3>
        <p className="dj-ranking-meta">{monthLabel}</p>
        {!loaded ? (
          <p className="dj-ranking-loading">불러오는 중…</p>
        ) : songs.length === 0 ? (
          <p className="dj-ranking-empty">아직 재생된 곡이 없어요</p>
        ) : (
          <ol className="dj-ranking-list">
            {songs.map((s, i) => (
              <li key={s.linkUrl} className="dj-ranking-row">
                <span className="dj-ranking-rank">{i + 1}</span>
                {s.linkImage ? (
                  <img
                    className="dj-ranking-thumb"
                    src={s.linkImage}
                    width={48}
                    height={27}
                    alt=""
                  />
                ) : (
                  <span className="dj-ranking-thumb dj-ranking-thumb-blank" />
                )}
                <span className="dj-ranking-name" title={s.title}>
                  {s.title}
                </span>
                <span className="dj-ranking-count">{s.count}회</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="dj-ranking-section">
        <h3 className="dj-ranking-title">🙌 많이 신청한 사람</h3>
        <p className="dj-ranking-meta">{monthLabel}</p>
        {!loaded ? (
          <p className="dj-ranking-loading">불러오는 중…</p>
        ) : submittersHidden ? (
          <p className="dj-ranking-empty">
            익명 보드에서는 신청자 순위를 숨겨요
          </p>
        ) : submitters.length === 0 ? (
          <p className="dj-ranking-empty">아직 신청이 없어요</p>
        ) : (
          <ol className="dj-ranking-list">
            {submitters.map((s, i) => (
              <li key={s.key} className="dj-ranking-row">
                <span className="dj-ranking-rank">{i + 1}</span>
                <span className="dj-ranking-name">
                  {s.name}
                  {!s.isStudent && (
                    <span className="dj-ranking-tag">선생님</span>
                  )}
                </span>
                <span className="dj-ranking-count">{s.count}곡</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
