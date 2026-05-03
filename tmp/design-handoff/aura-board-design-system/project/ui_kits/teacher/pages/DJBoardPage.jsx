/* global React */
const { useState, useMemo, useEffect } = React;

/* ───────────── DJ Queue Board ─────────────
   - 중앙: Now Playing + 대기열 (드래그로 순서 변경)
   - 왼쪽: 재생 완료 곡 스택 (drawer). 스택에서 대기열로 드래그해서 복귀
   - 오른쪽: 신청곡 추가 + 신청 TOP
   Tweaks에서 왼쪽 패널의 초기 상태/위치, 재생완료 표시 방식을 조절할 수 있음. */

function DJBoardPage({ onBack, tweaks = {} }) {
  const {
    playedOpen: playedOpenInit = true,
    playedPosition = "left",     // left | right
    playedStyle = "drawer",      // drawer | modal
    showPendingBadge = true,
  } = tweaks;

  const [queue, setQueue] = useState([
    { id: "q1", title: "봄에 듣기 좋은 인디 플레이리스트", desc: "3분 32초", submitter: "김재민", status: "approved" },
    { id: "q2", title: "Lo-fi 공부 브금 #2", desc: "2분 48초", submitter: "이수연", status: "approved" },
    { id: "q3", title: "IU - 밤편지 (cover)", desc: "4분 11초", submitter: "박도윤", status: "pending" },
    { id: "q4", title: "체육대회 입장 음악", desc: "3분 05초", submitter: "최하윤", status: "pending" },
    { id: "q5", title: "교실 청소 타임 10분 믹스", desc: "10분 00초", submitter: "정유진", status: "approved" },
  ]);
  const [played, setPlayed] = useState([
    { id: "p1", title: "아침 조회 오프닝 BGM", desc: "2분 14초", submitter: "이수연" },
    { id: "p2", title: "1교시 쉬는시간 믹스", desc: "4분 48초", submitter: "김재민" },
    { id: "p3", title: "점심시간 인기곡 모음", desc: "6분 02초", submitter: "한서준" },
  ]);
  const [now, setNow] = useState({ title: "아침 활동 BGM 모음집", desc: "5분 22초", submitter: "김재민" });
  const [playing, setPlaying] = useState(true);
  const [submitUrl, setSubmitUrl] = useState("");
  const [playedOpen, setPlayedOpen] = useState(playedOpenInit);

  // drag state: { kind: 'queue'|'played', id }
  const [drag, setDrag] = useState(null);
  const [overId, setOverId] = useState(null);
  const [overZone, setOverZone] = useState(null); // 'queue' | 'played' (drop target container)

  useEffect(() => { setPlayedOpen(playedOpenInit); }, [playedOpenInit]);

  function approve(id) { setQueue((q) => q.map((c) => c.id === id ? { ...c, status: "approved" } : c)); }
  function reject(id) { setQueue((q) => q.filter((c) => c.id !== id)); }
  function markPlayed(id) {
    setQueue((q) => {
      const c = q.find((x) => x.id === id);
      if (!c) return q;
      setPlayed((p) => [{ id: c.id, title: c.title, desc: c.desc, submitter: c.submitter }, ...p]);
      return q.filter((x) => x.id !== id);
    });
  }
  function skipNext() {
    const next = queue.find((c) => c.status === "approved");
    if (!next) return;
    // 현재 곡을 played 스택 맨 위로 이동
    setPlayed((p) => [{ id: "np-" + Date.now(), title: now.title, desc: now.desc, submitter: now.submitter }, ...p]);
    setNow({ title: next.title, desc: next.desc, submitter: next.submitter });
    setQueue((q) => q.filter((c) => c.id !== next.id));
    setPlaying(true);
  }
  function restoreFromPlayed(playedCard, targetIndex = null) {
    setPlayed((p) => p.filter((x) => x.id !== playedCard.id));
    setQueue((q) => {
      const restored = { id: "r-" + playedCard.id + "-" + Date.now(), title: playedCard.title, desc: playedCard.desc, submitter: playedCard.submitter, status: "approved" };
      const next = [...q];
      const idx = targetIndex == null ? next.length : Math.max(0, Math.min(targetIndex, next.length));
      next.splice(idx, 0, restored);
      return next;
    });
  }
  function submit(e) {
    e.preventDefault();
    const t = submitUrl.trim();
    if (!t) return;
    setQueue((q) => [...q, { id: "q" + Date.now(), title: t || "새 신청곡", desc: "3분 00초", submitter: "학생 신청", status: "pending" }]);
    setSubmitUrl("");
  }

  // ── DnD handlers ─────────────────────────────────────────────
  function onDragStart(kind, id) { setDrag({ kind, id }); }
  function onDragEnd() { setDrag(null); setOverId(null); setOverZone(null); }

  function onQueueItemDrop(targetId) {
    if (!drag) return;
    if (drag.kind === "queue") {
      if (drag.id === targetId) return;
      setQueue((q) => {
        const from = q.findIndex((c) => c.id === drag.id);
        const to = q.findIndex((c) => c.id === targetId);
        if (from === -1 || to === -1) return q;
        const next = [...q];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    } else if (drag.kind === "played") {
      const card = played.find((p) => p.id === drag.id);
      if (!card) return;
      const to = queue.findIndex((c) => c.id === targetId);
      restoreFromPlayed(card, to === -1 ? null : to);
    }
    onDragEnd();
  }

  function onQueueContainerDrop() {
    if (!drag || drag.kind !== "played") return;
    const card = played.find((p) => p.id === drag.id);
    if (card) restoreFromPlayed(card);
    onDragEnd();
  }

  function onPlayedContainerDrop() {
    if (!drag || drag.kind !== "queue") return;
    const card = queue.find((c) => c.id === drag.id);
    if (!card) return;
    setQueue((q) => q.filter((c) => c.id !== drag.id));
    setPlayed((p) => [{ id: "pm-" + Date.now(), title: card.title, desc: card.desc, submitter: card.submitter }, ...p]);
    onDragEnd();
  }

  const ranking = useMemo(() => {
    const counts = new Map();
    [{ submitter: now.submitter }, ...queue, ...played].forEach((c) => {
      counts.set(c.submitter, (counts.get(c.submitter) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [queue, now, played]);

  const PlayedPanel = (
    <section
      className={`ab-dj-played ab-dj-played-${playedStyle} ab-dj-played-${playedPosition}${playedOpen ? " open" : ""}`}
      onDragOver={(e) => { if (drag?.kind === "queue") { e.preventDefault(); setOverZone("played"); } }}
      onDragLeave={() => setOverZone((z) => z === "played" ? null : z)}
      onDrop={onPlayedContainerDrop}
      style={overZone === "played" ? { outline: "2px dashed var(--color-accent)", outlineOffset: -4 } : null}
    >
      <header className="ab-dj-played-head">
        <div>
          <div className="ab-dj-played-title">재생 완료</div>
          <div className="ab-dj-played-sub">드래그로 대기열에 복귀시킬 수 있습니다</div>
        </div>
        <button className="ab-icon-btn" onClick={() => setPlayedOpen(false)} aria-label="닫기">×</button>
      </header>
      {played.length === 0 ? (
        <div className="ab-empty" style={{ padding: "24px 16px" }}>재생 완료된 곡이 없습니다.</div>
      ) : (
        <ul className="ab-dj-played-list">
          {played.map((p) => (
            <li
              key={p.id}
              className={`ab-dj-played-item${drag?.id === p.id ? " dragging" : ""}`}
              draggable
              onDragStart={() => onDragStart("played", p.id)}
              onDragEnd={onDragEnd}
            >
              <div className="ab-dj-tinythumb" style={{ background: "linear-gradient(135deg,#d0d0d0,#b5b5b5)", width: 44, height: 34, fontSize: 14 }}>♪</div>
              <div className="ab-dj-info">
                <div className="ab-dj-track">{p.title}</div>
                <div className="ab-dj-sub">{p.desc} · {p.submitter}</div>
              </div>
              <button className="ab-dj-ctrl" onClick={() => restoreFromPlayed(p)} title="대기열로 복귀">↺</button>
            </li>
          ))}
        </ul>
      )}
      <footer className="ab-dj-played-foot">
        총 {played.length}곡 재생됨
      </footer>
    </section>
  );

  return (
    <>
      <div className="ab-page-shell">
        <div className="ab-header">
          <div>
            <button className="ab-back" onClick={onBack}>← 내 보드</button>
            <h1 className="ab-home-title" style={{ marginTop: 4 }}>🎧 3학년 2반 교실 DJ</h1>
            <p className="ab-home-subtitle">
              DJ 큐 · 대기 {queue.filter((c) => c.status === "pending").length} · 승인 {queue.filter((c) => c.status === "approved").length} · 재생 완료 {played.length}
            </p>
          </div>
          <div className="ab-header-actions">
            <button className="ab-btn-secondary" onClick={() => setPlayedOpen((v) => !v)}>
              🕘 재생 완료 ({played.length})
            </button>
            <button className="ab-btn-secondary">공유</button>
          </div>
        </div>

        <div className="ab-dj-now">
          <div className="ab-dj-nowlbl">▶ NOW PLAYING</div>
          <div className="ab-dj-nowbody">
            <div className="ab-dj-thumb">♪</div>
            <div>
              <h2 className="ab-dj-title">{now.title}</h2>
              <div className="ab-dj-meta">{now.desc} · {now.submitter}님 신청</div>
              <div className="ab-dj-actions">
                <button className="ab-dj-play" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "❚❚ 일시정지" : "▶ 재생"}
                </button>
                <button className="ab-dj-next" onClick={skipNext}>⏭ 다음 곡</button>
              </div>
            </div>
          </div>
        </div>

        <div className="ab-dj-layout">
          <div
            className="ab-dj-queue"
            onDragOver={(e) => { if (drag?.kind === "played") { e.preventDefault(); setOverZone("queue"); } }}
            onDragLeave={() => setOverZone((z) => z === "queue" ? null : z)}
            onDrop={onQueueContainerDrop}
            style={overZone === "queue" ? { outline: "2px dashed var(--color-accent)", outlineOffset: -4 } : null}
          >
            <h3 className="ab-dj-queue-title">
              대기열
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)" }}>드래그해서 순서 변경 · 재생 완료에서도 복귀 가능</span>
            </h3>
            {queue.length === 0 ? (
              <div className="ab-empty">신청곡이 없습니다. 학생들에게 신청을 받아보세요.</div>
            ) : queue.map((c, i) => (
              <div
                key={c.id}
                className={`ab-dj-item${c.status === "pending" && showPendingBadge ? " pending" : ""}${drag?.id === c.id ? " dragging" : ""}`}
                draggable
                onDragStart={() => onDragStart("queue", c.id)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => { e.preventDefault(); setOverId(c.id); }}
                onDrop={() => onQueueItemDrop(c.id)}
                style={overId === c.id ? { outline: "2px dashed var(--color-accent)" } : null}
              >
                <div className="ab-dj-rank">{i + 1}</div>
                <div className="ab-dj-tinythumb">♪</div>
                <div className="ab-dj-info">
                  <div className="ab-dj-track">{c.title}</div>
                  <div className="ab-dj-sub">
                    {c.desc} · {c.submitter}
                    {c.status === "pending" && showPendingBadge && <span className="ab-pill ab-pill-warn" style={{ marginLeft: 6, position: "static" }}><span className="ab-dot"></span>대기</span>}
                  </div>
                </div>
                <div className="ab-dj-controls">
                  {c.status === "pending" && <button className="ab-dj-ctrl approve" onClick={() => approve(c.id)}>승인</button>}
                  <button className="ab-dj-ctrl" onClick={() => markPlayed(c.id)} title="재생 완료로 이동">✓</button>
                  <button className="ab-dj-ctrl reject" onClick={() => reject(c.id)}>{c.status === "pending" ? "거부" : "제거"}</button>
                </div>
              </div>
            ))}
          </div>

          <aside className="ab-dj-side">
            <div className="ab-dj-submit-card">
              <h3 className="ab-dj-submit-title">신청곡 추가</h3>
              <form onSubmit={submit}>
                <input
                  className="ab-modal-input"
                  placeholder="YouTube 링크 또는 곡 제목"
                  value={submitUrl}
                  onChange={(e) => setSubmitUrl(e.target.value)}
                />
                <button className="ab-btn-primary" type="submit" style={{ width: "100%", marginTop: 10 }}>신청하기</button>
                <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
                  학생 신청은 대기 상태로 등록되고, 교사 승인 후 재생 목록에 올라갑니다.
                </p>
              </form>
            </div>
            <div className="ab-dj-ranking">
              <h3 className="ab-dj-submit-title">신청 TOP</h3>
              {ranking.map((r, i) => (
                <div key={r.name} className="ab-dj-ranking-row">
                  <span className={`ab-dj-ranking-pos${i < 3 ? " top" : ""}`}>{i + 1}</span>
                  <span
                    className="ab-roster-avatar"
                    style={{ width: 22, height: 22, fontSize: 10, background: (i === 0) ? "#c9a227" : "rgba(0,0,0,0.08)", color: i === 0 ? "#fff" : "var(--color-text)" }}
                  >
                    {r.name[0]}
                  </span>
                  <span className="ab-dj-ranking-name">{r.name}</span>
                  <span className="ab-dj-ranking-count">{r.count}곡</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* 재생 완료 패널 — drawer or modal */}
      {playedStyle === "modal" && playedOpen && (
        <div className="ab-modal-backdrop" onClick={() => setPlayedOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>{PlayedPanel}</div>
        </div>
      )}
      {playedStyle === "drawer" && PlayedPanel}
    </>
  );
}

Object.assign(window, { DJBoardPage });
