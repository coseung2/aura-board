/* global React */
const { useState } = React;

const LAYOUTS = [
  { id: "freeform", emoji: "🎯", label: "자유 배치", desc: "캔버스 위에 자유롭게 카드 배치" },
  { id: "grid", emoji: "🔲", label: "그리드", desc: "깔끔한 격자 형태로 카드 정렬" },
  { id: "stream", emoji: "📜", label: "스트림", desc: "위에서 아래로 흐르는 피드형" },
  { id: "columns", emoji: "📊", label: "칼럼", desc: "Kanban 스타일 섹션별 관리" },
  { id: "assignment", emoji: "📋", label: "과제 배부", desc: "학생별 과제 제출 및 확인" },
  { id: "quiz", emoji: "🎮", label: "퀴즈", desc: "카훗 스타일 실시간 퀴즈 게임" },
];

function TeacherDashboard({ boards, onNew, onOpen, onDelete, onDuplicate, onGoClassrooms }) {
  const [menu, setMenu] = useState(null);
  return (
    <div className="ab-home-page">
      <div className="ab-header">
        <div>
          <h1 className="ab-home-title">내 보드</h1>
          <p className="ab-home-subtitle">학급에 공유된 보드와 내가 만든 보드</p>
        </div>
        <div className="ab-header-actions">
          <button className="ab-btn-secondary" onClick={onGoClassrooms}>학급 관리 →</button>
          <button className="ab-btn-primary" onClick={onNew}>새 보드 만들기</button>
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="ab-board-grid">
          <button className="ab-board-card ab-board-new" onClick={onNew}>
            <div className="ab-board-emoji">+</div>
            <span className="ab-board-new-label">새 보드 만들기</span>
          </button>
          {boards.map((b) => (
            <div key={b.id} className="ab-board-card" style={{ cursor: "pointer" }} onClick={() => onOpen(b)}>
              <button
                className="ab-kebab"
                onClick={(e) => { e.stopPropagation(); setMenu(menu === b.id ? null : b.id); }}
                title="보드 관리"
              >···</button>
              <div className="ab-board-emoji">{b.emoji}</div>
              <div className="ab-board-title">{b.title}</div>
              <div className="ab-board-meta">{b.layoutLabel}</div>
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
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateBoardModal({ onClose, onCreate }) {
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState("");
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
        <div className="ab-layout-grid">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`ab-layout-option${selected === l.id ? " selected" : ""}`}
              onClick={() => setSelected(l.id)}
            >
              <div className="ab-layout-emoji">{l.emoji}</div>
              <div className="ab-layout-label">{l.label}</div>
              <div className="ab-layout-desc">{l.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button className="ab-btn-secondary" onClick={onClose}>취소</button>
          <button
            className="ab-btn-primary"
            disabled={!selected || !title.trim()}
            onClick={() => {
              const l = LAYOUTS.find((x) => x.id === selected);
              onCreate({ id: "new-" + Date.now(), emoji: l.emoji, title: title.trim(), layoutLabel: l.label });
            }}
          >만들기</button>
        </div>
      </div>
    </div>
  );
}

function GridBoardView({ board, onBack }) {
  const [cards, setCards] = useState([
    { id: 1, author: "김재민", text: "오늘 배운 비례식이 건축에도 쓰인다는 게 재미있었어요." },
    { id: 2, author: "이수연", text: "독서 감상: 『어린 왕자』의 사막 여우 장면이 가장 기억에 남았어요." },
    { id: 3, author: "박도윤", text: "과학 실험에서 물의 표면장력이 예상보다 강했습니다." },
  ]);
  function add() {
    const text = prompt("카드 내용");
    if (text) setCards([...cards, { id: Date.now(), author: "선생님", text }]);
  }
  return (
    <div className="ab-home-page">
      <div className="ab-header">
        <div>
          <button className="ab-back" onClick={onBack}>← 내 보드</button>
          <h1 className="ab-home-title" style={{ marginTop: 4 }}>{board.emoji} {board.title}</h1>
          <p className="ab-home-subtitle">{board.layoutLabel} · 참여 학생 24명</p>
        </div>
        <div className="ab-header-actions">
          <button className="ab-btn-secondary">공유</button>
          <button className="ab-btn-primary" onClick={add}>카드 추가</button>
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
        {cards.map((c) => (
          <div key={c.id} style={{
            background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12,
            boxShadow: "rgba(0,0,0,0.04) 0 4px 18px, rgba(0,0,0,0.027) 0 2.025px 7.85px, rgba(0,0,0,0.02) 0 0.8px 2.93px",
            padding: 20, minHeight: 140,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#097fe8", background: "#f2f9ff", padding: "2px 8px", borderRadius: 9999, display: "inline-block", letterSpacing: 0.125 }}>
              {c.author}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.5 }}>{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TeacherDashboard, CreateBoardModal, GridBoardView });
