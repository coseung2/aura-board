/* global React */
const { useState } = React;

/* ───────────── Shared chrome ───────────── */

function Logo({ size = 32, withWordmark = false }) {
  return (
    <span className="ab-logo-lockup">
      <img
        className="ab-logo-img"
        src="aura-app-icon-512.png"
        alt="Aura-board"
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
      />
      {withWordmark && <span className="ab-logo-wordmark">Aura-board</span>}
    </span>
  );
}

function TopNav({ active, onNav }) {
  const tabs = [
    { id: "dashboard", label: "보드" },
    { id: "classrooms", label: "학급" },
    { id: "columns-demo", label: "칼럼" },
    { id: "dj-demo", label: "DJ 큐" },
  ];
  return (
    <header className="ab-topnav">
      <div className="ab-topnav-left">
        <button
          className="ab-topnav-link"
          style={{ padding: 0 }}
          onClick={() => onNav("dashboard")}
          title="Aura-board"
        >
          <Logo size={32} withWordmark />
        </button>
        <nav className="ab-topnav-links">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`ab-topnav-link${active === t.id ? " active" : ""}`}
              onClick={() => onNav(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="ab-topnav-right">
        <button className="ab-btn-secondary" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => alert("새 보드 만들기")}>
          + 새 보드
        </button>
        <div className="ab-avatar" title="이선생">이</div>
      </div>
    </header>
  );
}

/* ───────────── Dashboard page ───────────── */

const LAYOUTS = {
  freeform: { emoji: "🎯", label: "자유 배치" },
  grid: { emoji: "🔲", label: "그리드" },
  stream: { emoji: "📜", label: "스트림" },
  columns: { emoji: "📊", label: "칼럼" },
  assignment: { emoji: "📋", label: "과제 배부" },
  quiz: { emoji: "🎮", label: "퀴즈" },
  drawing: { emoji: "🎨", label: "그림보드" },
  breakout: { emoji: "👥", label: "모둠 학습" },
  assessment: { emoji: "📝", label: "수행평가" },
  "dj-queue": { emoji: "🎧", label: "DJ 큐" },
};

function DashboardPage({ boards, onNew, onOpen, onDelete, onDuplicate, onGotoClassroom }) {
  const [menu, setMenu] = useState(null);
  return (
    <div className="ab-page-shell">
      <div className="ab-header">
        <div>
          <h1 className="ab-home-title">내 보드</h1>
          <p className="ab-home-subtitle">학급에 공유된 보드와 내가 만든 보드 · 총 {boards.length}개</p>
        </div>
        <div className="ab-header-actions">
          <button className="ab-btn-secondary" onClick={onGotoClassroom}>학급 관리 →</button>
          <button className="ab-btn-primary" onClick={onNew}>새 보드 만들기</button>
        </div>
      </div>
      <div className="ab-board-grid">
        <button className="ab-board-card ab-board-new" onClick={onNew}>
          <div className="ab-board-emoji">+</div>
          <span className="ab-board-new-label">새 보드 만들기</span>
        </button>
        {boards.map((b) => {
          const l = LAYOUTS[b.layout] ?? { emoji: "📋", label: b.layout };
          return (
            <div key={b.id} className="ab-board-card" style={{ cursor: "pointer" }} onClick={() => onOpen(b)}>
              <button
                className="ab-kebab"
                onClick={(e) => { e.stopPropagation(); setMenu(menu === b.id ? null : b.id); }}
                title="보드 관리"
              >···</button>
              <div className="ab-board-emoji">{l.emoji}</div>
              <div className="ab-board-title">{b.title}</div>
              <div className="ab-board-meta">{l.label}</div>
              {menu === b.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute", top: 34, right: 8, background: "#fff",
                    border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.12)", minWidth: 110, overflow: "hidden", zIndex: 2,
                  }}
                >
                  <button
                    style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
                    onClick={() => { onDuplicate(b); setMenu(null); }}
                  >복제</button>
                  <button
                    style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", cursor: "pointer", fontSize: 13, color: "#c62828", fontFamily: "inherit" }}
                    onClick={() => { onDelete(b); setMenu(null); }}
                  >삭제</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Create-board modal (unchanged logic) ───────────── */
function CreateBoardModal({ onClose, onCreate }) {
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState("");
  const layoutList = Object.entries(LAYOUTS).map(([id, v]) => ({ id, ...v }));
  return (
    <div className="ab-modal-backdrop" onClick={onClose}>
      <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="ab-modal-title">새 보드 만들기</h2>
        <input
          className="ab-modal-input"
          placeholder="보드 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <div className="ab-layout-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {layoutList.map((l) => (
            <button
              key={l.id}
              className={`ab-layout-option${selected === l.id ? " selected" : ""}`}
              onClick={() => setSelected(l.id)}
            >
              <div className="ab-layout-emoji">{l.emoji}</div>
              <div className="ab-layout-label">{l.label}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button className="ab-btn-secondary" onClick={onClose}>취소</button>
          <button
            className="ab-btn-primary"
            disabled={!selected || !title.trim()}
            onClick={() => onCreate({
              id: "new-" + Date.now(),
              layout: selected,
              title: title.trim(),
            })}
          >만들기</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Logo, TopNav, DashboardPage, CreateBoardModal, LAYOUTS });
