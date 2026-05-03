/* global React */
const { useState } = React;

const COLOR_POOL = ["#a69bff","#ff9ebd","#8ccfff","#ffd28c","#9ee5c1","#ffb08c"];
function initials(name) { return name ? name.slice(0, 1) : "?"; }
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length];
}

/* ───────────── Classroom list ───────────── */

function ClassroomListPage({ classrooms, onOpen, onCreate }) {
  const [modal, setModal] = useState(false);
  return (
    <div className="ab-page-shell">
      <div className="ab-header">
        <div>
          <h1 className="ab-home-title">학급 관리</h1>
          <p className="ab-home-subtitle">학급을 만들고 학생을 초대하거나, 보드를 학급에 공유하세요.</p>
        </div>
        <div className="ab-header-actions">
          <button className="ab-btn-primary" onClick={() => setModal(true)}>학급 만들기</button>
        </div>
      </div>
      <div className="ab-cls-grid">
        <button className="ab-cls-card ab-cls-new" onClick={() => setModal(true)}>
          <div className="ab-cls-new-icon">+</div>
          <span className="ab-cls-new-label">학급 만들기</span>
        </button>
        {classrooms.map((c) => (
          <button key={c.id} className="ab-cls-card" onClick={() => onOpen(c)}>
            <div className="ab-cls-name">{c.name}</div>
            <span className="ab-cls-code">{c.code}</span>
            <div className="ab-cls-stats">
              <span><span className="ab-cls-stat-num">{c.studentCount}</span> 명</span>
              <span className="ab-cls-stat-sep" />
              <span><span className="ab-cls-stat-num">{c.boardCount}</span> 보드</span>
            </div>
          </button>
        ))}
      </div>
      {modal && (
        <div className="ab-modal-backdrop" onClick={() => setModal(false)}>
          <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="ab-modal-title">학급 만들기</h2>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
              학급 이름을 입력하세요. 6자리 초대 코드는 자동 생성됩니다.
            </p>
            <input
              id="cls-name"
              className="ab-modal-input"
              placeholder="예) 3학년 2반"
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="ab-btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button
                className="ab-btn-primary"
                onClick={() => {
                  const v = document.getElementById("cls-name").value.trim();
                  if (!v) return;
                  onCreate(v);
                  setModal(false);
                }}
              >만들기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Classroom detail ───────────── */

function ClassroomDetailPage({ classroom, onBack, onRotateCode }) {
  const [tab, setTab] = useState("roster");
  const [copied, setCopied] = useState(false);
  const [students, setStudents] = useState(classroom.students);
  const [pendingParents, setPendingParents] = useState(classroom.pendingParents ?? []);

  function copy() {
    navigator.clipboard?.writeText(classroom.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  function removeStudent(id) {
    if (confirm("이 학생을 학급에서 제거하시겠습니까?")) {
      setStudents((s) => s.filter((x) => x.id !== id));
    }
  }
  function approveParent(id) { setPendingParents((p) => p.filter((x) => x.id !== id)); }

  return (
    <div className="ab-page-shell">
      <button className="ab-back" onClick={onBack}>← 학급 목록</button>

      <div className="ab-cls-detail-header" style={{ marginTop: 8 }}>
        <div>
          <h1 className="ab-home-title">{classroom.name}</h1>
          <p className="ab-home-subtitle">
            학생 {students.length}명 · 보드 {classroom.boardCount}개
          </p>
        </div>
        <div className="ab-cls-invite-card">
          <div>
            <div className="ab-cls-invite-label">학생 초대 코드</div>
            <div className="ab-cls-invite-code">{classroom.code}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="ab-btn-secondary" onClick={copy} style={{ padding: "6px 14px", fontSize: 13 }}>
              {copied ? "복사됨 ✓" : "복사"}
            </button>
            <button className="ab-icon-btn" onClick={onRotateCode} title="코드 재생성">새 코드</button>
          </div>
        </div>
      </div>

      <div className="ab-tab-row">
        <button className={`ab-tab${tab === "roster" ? " active" : ""}`} onClick={() => setTab("roster")}>학생 명단 ({students.length})</button>
        <button className={`ab-tab${tab === "parents" ? " active" : ""}`} onClick={() => setTab("parents")}>
          학부모 연결
          {pendingParents.length > 0 && <span className="ab-pill ab-pill-warn" style={{ position: "static", marginLeft: 8 }}>{pendingParents.length}</span>}
        </button>
        <button className={`ab-tab${tab === "boards" ? " active" : ""}`} onClick={() => setTab("boards")}>공유된 보드</button>
        <button className={`ab-tab${tab === "settings" ? " active" : ""}`} onClick={() => setTab("settings")}>설정</button>
      </div>

      {tab === "roster" && (
        <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <table className="ab-roster-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>학생</th>
                <th>개별 코드</th>
                <th>최근 접속</th>
                <th>연결된 보호자</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span
                      className="ab-roster-avatar"
                      style={{ background: colorFor(s.name) }}
                    >{initials(s.name)}</span>
                  </td>
                  <td><div className="ab-student-name">{s.name}</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{s.grade}</div></td>
                  <td><span className="ab-code-chip">{s.personalCode}</span></td>
                  <td style={{ color: "var(--color-text-muted)" }}>{s.lastSeen}</td>
                  <td>
                    {s.parent ? (
                      <span className="ab-pill ab-pill-rev" style={{ position: "static" }}><span className="ab-dot"></span>{s.parent}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <button className="ab-icon-btn danger" onClick={() => removeStudent(s.id)}>제거</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 16, borderTop: "1px solid var(--color-border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="ab-btn-secondary">CSV 내보내기</button>
            <button className="ab-btn-secondary">QR 인쇄</button>
            <button className="ab-btn-primary" onClick={() => alert("학생 추가 모달 (모의)")}>+ 학생 추가</button>
          </div>
        </div>
      )}

      {tab === "parents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 12, padding: 20, boxShadow: "var(--shadow-card)" }}>
            <h3 className="ab-section-title" style={{ fontSize: 16, marginBottom: 6 }}>승인 대기 중인 신청</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
              학부모가 자녀와의 연결을 요청했습니다. 7일 이내 승인하지 않으면 자동 만료됩니다.
            </p>
            {pendingParents.length === 0 ? (
              <div className="ab-empty" style={{ padding: 24 }}>대기 중인 신청이 없습니다.</div>
            ) : pendingParents.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--color-border)" }}>
                <span className="ab-roster-avatar" style={{ background: colorFor(p.parent) }}>{initials(p.parent)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.parent} → <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>{p.student}</span></div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{p.email} · {p.daysAgo}일 전 신청</div>
                </div>
                <span className="ab-pill ab-pill-warn" style={{ position: "static" }}>D-{7 - p.daysAgo}</span>
                <button className="ab-btn-secondary" onClick={() => removeStudent(p.id)}>거부</button>
                <button className="ab-btn-primary" onClick={() => approveParent(p.id)}>승인</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "boards" && (
        <div className="ab-board-grid">
          {classroom.boards.map((b) => {
            const l = (window.LAYOUTS ?? {})[b.layout] ?? { emoji: "📋", label: b.layout };
            return (
              <div key={b.id} className="ab-board-card" onClick={() => alert("보드 열기 (모의): " + b.title)}>
                <div className="ab-board-emoji">{l.emoji}</div>
                <div className="ab-board-title">{b.title}</div>
                <div className="ab-board-meta">{l.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "settings" && (
        <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow-card)" }}>
          <h3 className="ab-section-title" style={{ fontSize: 16 }}>학급 설정</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="ab-field-label">학급 이름</span>
              <input className="ab-modal-input" defaultValue={classroom.name} style={{ maxWidth: 380 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="ab-field-label">학년</span>
              <select className="ab-modal-input" defaultValue={classroom.grade} style={{ maxWidth: 200 }}>
                <option>1학년</option><option>2학년</option><option>3학년</option><option>4학년</option><option>5학년</option><option>6학년</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <input type="checkbox" defaultChecked />
              <span style={{ fontSize: 14 }}>학부모 주간 활동 요약 메일 발송</span>
            </label>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
              <button className="ab-btn-danger" onClick={() => confirm("학급을 종료하시겠습니까? 학생 접속이 차단되고 모든 연결이 해제됩니다.")}>
                학급 종료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ClassroomListPage, ClassroomDetailPage });
