/* global React */
const { useState, useMemo, useEffect, useRef } = React;

/* ───────────── Columns (Kanban) Board ─────────────
   Full-width page scroll (horizontal scroll on body, not container).
   Card-level + column-level kebab menus. */

const COLOR_POOL = ["#a69bff","#ff9ebd","#8ccfff","#ffd28c","#9ee5c1","#ffb08c"];
function initials(name) { return name ? name.slice(0, 1) : "?"; }
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length];
}

const SORT_OPTIONS = [
  { value: "manual", label: "수동" },
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된 순" },
  { value: "title", label: "제목순" },
];

function sortCards(cards, mode) {
  const c = [...cards];
  if (mode === "newest") return c.sort((a, b) => b.createdAt - a.createdAt);
  if (mode === "oldest") return c.sort((a, b) => a.createdAt - b.createdAt);
  if (mode === "title") return c.sort((a, b) => a.title.localeCompare(b.title, "ko"));
  return c.sort((a, b) => a.order - b.order);
}

/* ── Dropdown that closes on outside click / escape ───────────── */
function useDismiss(open, setOpen) {
  useEffect(() => {
    if (!open) return;
    function onDocClick() { setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    // defer so the triggering click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
}

/* ── Card kebab menu ──────────────────────────────────────────── */
function CardMenu({ card, sections, onMove, onDelete, onEdit }) {
  const [open, setOpen] = useState(false);
  useDismiss(open, setOpen);
  return (
    <>
      <button
        className={`ab-col-card-kebab${open ? " open" : ""}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="카드 메뉴"
      >⋯</button>
      {open && (
        <div className="ab-menu" style={{ top: 32, right: 6 }} onClick={(e) => e.stopPropagation()}>
          <button className="ab-menu-item" onClick={() => { onEdit(); setOpen(false); }}>✎ 편집</button>
          <div className="ab-menu-sep" />
          <div className="ab-menu-label">이동</div>
          {sections.filter((s) => s.id !== card.sectionId).map((s) => (
            <button key={s.id} className="ab-menu-item" onClick={() => { onMove(s.id); setOpen(false); }}>
              → {s.title}
            </button>
          ))}
          <div className="ab-menu-sep" />
          <button className="ab-menu-item danger" onClick={() => { onDelete(); setOpen(false); }}>🗑 삭제</button>
        </div>
      )}
    </>
  );
}

/* ── Column kebab menu ────────────────────────────────────────── */
function ColumnMenu({ section, onRename, onClear, onDeleteCol, onAddCard, onSetSort }) {
  const [open, setOpen] = useState(false);
  useDismiss(open, setOpen);
  return (
    <div style={{ position: "relative" }}>
      <button
        className="ab-col-kebab"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="칼럼 메뉴"
      >⋯</button>
      {open && (
        <div className="ab-menu" style={{ top: 28, right: 0 }} onClick={(e) => e.stopPropagation()}>
          <button className="ab-menu-item" onClick={() => { onAddCard(); setOpen(false); }}>+ 카드 추가</button>
          <button className="ab-menu-item" onClick={() => { onRename(); setOpen(false); }}>✎ 칼럼 이름 변경</button>
          <div className="ab-menu-sep" />
          <div className="ab-menu-label">정렬</div>
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              className="ab-menu-item"
              onClick={() => { onSetSort(o.value); setOpen(false); }}
              style={section.sortMode === o.value ? { background: "var(--color-accent-tinted-bg)", color: "var(--color-accent-tinted-text)" } : null}
            >
              {section.sortMode === o.value ? "✓ " : "  "}{o.label}
            </button>
          ))}
          <div className="ab-menu-sep" />
          <button className="ab-menu-item danger" onClick={() => { onClear(); setOpen(false); }}>🧹 카드 모두 비우기</button>
          <button className="ab-menu-item danger" onClick={() => { onDeleteCol(); setOpen(false); }}>🗑 칼럼 삭제</button>
        </div>
      )}
    </div>
  );
}

/* ── Card detail modal ────────────────────────────────────────
   - 왼쪽/오른쪽 네비 버튼: 같은 칼럼 안에서 이전/다음 카드로 이동
   - 우측 하단 ⛶ 버튼: 전체화면 (Fullscreen API) */
function CardModal({ card, sameColumnCards, onClose, onGo }) {
  const rootRef = useRef(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goRel(-1);
      else if (e.key === "ArrowRight") goRel(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    function onFsChange() { setIsFs(document.fullscreenElement === rootRef.current); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const idx = sameColumnCards.findIndex((c) => c.id === card.id);
  function goRel(delta) {
    const next = sameColumnCards[idx + delta];
    if (next) onGo(next);
  }
  function toggleFs() {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  }

  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < sameColumnCards.length - 1;

  return (
    <div className="ab-modal-backdrop" onClick={onClose}>
      <button
        className="ab-card-nav ab-card-nav-prev"
        disabled={!hasPrev}
        onClick={(e) => { e.stopPropagation(); goRel(-1); }}
        aria-label="이전 카드"
        title="이전 카드 (←)"
      >‹</button>

      <div
        ref={rootRef}
        className={`ab-card-modal${isFs ? " fs" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ab-card-modal-head">
          <div className="ab-card-modal-meta">
            <span
              className="ab-roster-avatar"
              style={{ width: 28, height: 28, fontSize: 12, background: colorFor(card.author) }}
            >{initials(card.author)}</span>
            <div>
              <div className="ab-card-modal-author">{card.author}</div>
              <div className="ab-card-modal-pos">
                {idx + 1} / {sameColumnCards.length} · 같은 칼럼
              </div>
            </div>
          </div>
          <button className="ab-icon-btn" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">✕</button>
        </header>
        <div className="ab-card-modal-body">
          <h2 className="ab-card-modal-title">{card.title}</h2>
          {card.body ? (
            <p className="ab-card-modal-text">{card.body}</p>
          ) : (
            <p className="ab-card-modal-text" style={{ color: "var(--color-text-faint)" }}>본문이 없습니다.</p>
          )}
        </div>
        <button
          className="ab-card-fs"
          onClick={toggleFs}
          aria-label={isFs ? "전체화면 종료" : "전체화면"}
          title={isFs ? "전체화면 종료" : "전체화면"}
        >{isFs ? "⛶ 종료" : "⛶ 전체화면"}</button>
      </div>

      <button
        className="ab-card-nav ab-card-nav-next"
        disabled={!hasNext}
        onClick={(e) => { e.stopPropagation(); goRel(1); }}
        aria-label="다음 카드"
        title="다음 카드 (→)"
      >›</button>
    </div>
  );
}

function ColumnsBoardPage({ onBack }) {
  const [openCard, setOpenCard] = useState(null);
  const [sections, setSections] = useState([
    { id: "s1", title: "할 일", sortMode: "manual" },
    { id: "s2", title: "진행 중", sortMode: "manual" },
    { id: "s3", title: "검토 중", sortMode: "newest" },
    { id: "s4", title: "완료", sortMode: "manual" },
  ]);
  const [cards, setCards] = useState([
    { id: "c1", sectionId: "s1", order: 0, title: "자료 조사 역할 나누기", body: "역사 신문 만들기 — 담당 주제 배정", author: "김재민", createdAt: 1 },
    { id: "c2", sectionId: "s1", order: 1, title: "인터뷰 질문 초안", body: "세 문항씩 작성 후 모둠 공유", author: "이수연", createdAt: 2 },
    { id: "c3", sectionId: "s2", order: 0, title: "조선 왕실 자료 수집", body: "국립중앙박물관 자료 사진 3장 이상", author: "박도윤", createdAt: 3 },
    { id: "c4", sectionId: "s2", order: 1, title: "신문 레이아웃 스케치", body: "A3 가로, 4단 구성", author: "최하윤", createdAt: 4 },
    { id: "c5", sectionId: "s3", order: 0, title: "본문 초안 제출", body: "선생님 검토 요청", author: "김재민", createdAt: 5 },
    { id: "c6", sectionId: "s3", order: 1, title: "인터뷰 정리 사진", body: "흐릿한 사진 교체 필요", author: "이수연", createdAt: 6 },
    { id: "c7", sectionId: "s4", order: 0, title: "제목 선정 ‘그때 그 사람들’", body: "모둠 투표 결과 확정", author: "박도윤", createdAt: 7 },
  ]);
  const [drag, setDrag] = useState(null); // {cardId}
  const [overSection, setOverSection] = useState(null);

  // ── sections ops ────────────────────────────────────────────
  function setSort(sectionId, mode) {
    setSections((s) => s.map((x) => x.id === sectionId ? { ...x, sortMode: mode } : x));
  }
  function renameSection(sectionId) {
    const cur = sections.find((s) => s.id === sectionId);
    const v = prompt("칼럼 이름", cur?.title ?? "");
    if (!v) return;
    setSections((s) => s.map((x) => x.id === sectionId ? { ...x, title: v.trim() } : x));
  }
  function clearSection(sectionId) {
    if (!confirm("이 칼럼의 카드를 모두 삭제하시겠습니까?")) return;
    setCards((p) => p.filter((c) => c.sectionId !== sectionId));
  }
  function deleteSection(sectionId) {
    if (!confirm("칼럼을 삭제하시겠습니까? 포함된 카드도 함께 삭제됩니다.")) return;
    setCards((p) => p.filter((c) => c.sectionId !== sectionId));
    setSections((s) => s.filter((x) => x.id !== sectionId));
  }
  function addSection() {
    const v = prompt("새 칼럼 이름", "새 칼럼");
    if (!v) return;
    setSections((s) => [...s, { id: "s" + Date.now(), title: v.trim(), sortMode: "manual" }]);
  }

  // ── cards ops ───────────────────────────────────────────────
  function addCard(sectionId) {
    const title = prompt("카드 제목");
    if (!title) return;
    setCards((prev) => {
      const nextOrder = Math.max(-1, ...prev.filter((c) => c.sectionId === sectionId).map((c) => c.order)) + 1;
      return [...prev, { id: "c" + Date.now(), sectionId, order: nextOrder, title, body: "", author: "선생님", createdAt: Date.now() }];
    });
  }
  function editCard(id) {
    const cur = cards.find((c) => c.id === id);
    if (!cur) return;
    const t = prompt("제목", cur.title);
    if (t == null) return;
    const b = prompt("본문 (비워두면 본문 없음)", cur.body ?? "");
    setCards((p) => p.map((c) => c.id === id ? { ...c, title: t.trim() || c.title, body: (b ?? "").trim() } : c));
  }
  function moveCard(id, toSectionId) {
    setCards((p) => {
      const card = p.find((c) => c.id === id);
      if (!card) return p;
      const rest = p.filter((c) => c.id !== id);
      const nextOrder = Math.max(-1, ...rest.filter((c) => c.sectionId === toSectionId).map((c) => c.order)) + 1;
      return [...rest, { ...card, sectionId: toSectionId, order: nextOrder }];
    });
  }
  function deleteCard(id) {
    if (confirm("이 카드를 삭제하시겠습니까?")) setCards((p) => p.filter((c) => c.id !== id));
  }
  function onDropTo(sectionId) {
    if (!drag) return;
    moveCard(drag.cardId, sectionId);
    setDrag(null); setOverSection(null);
  }

  return (
    <div className="ab-page-shell ab-page-shell--wide">
      <div className="ab-header" style={{ maxWidth: "none" }}>
        <div>
          <button className="ab-back" onClick={onBack}>← 내 보드</button>
          <h1 className="ab-home-title" style={{ marginTop: 4 }}>📊 모둠 프로젝트: 역사 신문 만들기</h1>
          <p className="ab-home-subtitle">칼럼 · 3학년 2반 · 참여 학생 24명 · 화면을 좌우로 스크롤해 더 많은 칼럼을 볼 수 있습니다</p>
        </div>
        <div className="ab-header-actions">
          <button className="ab-btn-secondary">공유</button>
          <button className="ab-btn-secondary">내보내기</button>
          <button className="ab-btn-primary" onClick={() => addCard(sections[0]?.id)} disabled={!sections[0]}>+ 카드</button>
        </div>
      </div>

      <div className="ab-col-board">
        {sections.map((sec) => {
          const visible = sortCards(cards.filter((c) => c.sectionId === sec.id), sec.sortMode);
          const isOver = overSection === sec.id;
          return (
            <div
              key={sec.id}
              className="ab-column"
              style={isOver ? { outline: "2px solid var(--color-accent)", background: "rgba(0,117,222,0.04)" } : null}
              onDragOver={(e) => { e.preventDefault(); setOverSection(sec.id); }}
              onDragLeave={() => setOverSection((v) => v === sec.id ? null : v)}
              onDrop={() => onDropTo(sec.id)}
            >
              <div className="ab-column-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <span className="ab-column-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</span>
                  <span className="ab-column-count">{visible.length}</span>
                </div>
                <div className="ab-col-actions">
                  <ColumnMenu
                    section={sec}
                    onRename={() => renameSection(sec.id)}
                    onClear={() => clearSection(sec.id)}
                    onDeleteCol={() => deleteSection(sec.id)}
                    onAddCard={() => addCard(sec.id)}
                    onSetSort={(m) => setSort(sec.id, m)}
                  />
                </div>
              </div>
              {visible.map((card) => (
                <div
                  key={card.id}
                  className="ab-col-card"
                  draggable
                  onDragStart={() => setDrag({ cardId: card.id })}
                  onDragEnd={() => setDrag(null)}
                  onClick={(e) => {
                    // ignore clicks that came from the kebab menu
                    if (e.target.closest(".ab-col-card-kebab") || e.target.closest(".ab-menu")) return;
                    setOpenCard({ id: card.id, sectionId: card.sectionId });
                  }}
                  style={{ cursor: "pointer" }}
                  title="카드 열기 · 드래그해서 이동"
                >
                  <CardMenu
                    card={card}
                    sections={sections}
                    onEdit={() => editCard(card.id)}
                    onMove={(toId) => moveCard(card.id, toId)}
                    onDelete={() => deleteCard(card.id)}
                  />
                  <div className="ab-col-card-title" style={{ paddingRight: 24 }}>{card.title}</div>
                  {card.body && <div className="ab-col-card-body">{card.body}</div>}
                  <div className="ab-col-card-author">
                    <span
                      className="ab-roster-avatar"
                      style={{ width: 18, height: 18, fontSize: 10, background: colorFor(card.author) }}
                    >{initials(card.author)}</span>
                    {card.author}
                  </div>
                </div>
              ))}
              <button className="ab-col-add" onClick={() => addCard(sec.id)}>+ 카드 추가</button>
            </div>
          );
        })}

        {openCard && (() => {
          const card = cards.find((c) => c.id === openCard.id);
          if (!card) return null;
          const sameCol = sortCards(
            cards.filter((c) => c.sectionId === card.sectionId),
            sections.find((s) => s.id === card.sectionId)?.sortMode ?? "manual"
          );
          return (
            <CardModal
              card={card}
              sameColumnCards={sameCol}
              onClose={() => setOpenCard(null)}
              onGo={(c) => setOpenCard({ id: c.id, sectionId: c.sectionId })}
            />
          );
        })()}

        <button
          className="ab-column"
          onClick={addSection}
          style={{
            border: "1px dashed var(--color-border-hover)", background: "transparent",
            color: "var(--color-text-muted)", cursor: "pointer", fontFamily: "inherit",
            alignItems: "center", justifyContent: "center", minHeight: 120,
            fontSize: 14, fontWeight: 500,
          }}
        >+ 칼럼 추가</button>
      </div>
    </div>
  );
}

Object.assign(window, { ColumnsBoardPage });
