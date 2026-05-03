/* global React */
const { useState } = React;

function AuraHeader({ title, subtitle, right }) {
  return (
    <div className="ab-header">
      <div>
        <h1 className="ab-home-title">{title}</h1>
        {subtitle && <p className="ab-home-subtitle">{subtitle}</p>}
      </div>
      <div className="ab-header-actions">{right}</div>
    </div>
  );
}

function Logo({ size = 40 }) {
  const r = Math.round(size * 0.25);
  return (
    <div className="ab-logo" style={{ width: size, height: size, borderRadius: r, fontSize: size * 0.5 }}>A</div>
  );
}

function LoginCard({ onLogin }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="ab-login-page">
      <div className="ab-login-card">
        <Logo size={56} />
        <h1 className="ab-login-title">학생 로그인</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim().toUpperCase();
            if (c.length < 4) { setErr("코드를 다시 확인해 주세요"); return; }
            onLogin(c);
          }}
        >
          <input
            className="ab-login-input"
            placeholder="코드 입력"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }}
            maxLength={6}
            autoFocus
            spellCheck={false}
          />
          {err && <p className="ab-login-error">{err}</p>}
          <button className="ab-login-btn" type="submit" disabled={!code.trim()}>로그인</button>
        </form>
      </div>
    </div>
  );
}

function StudentDashboard({ name, classroomName, boards, onOpen, onLogout }) {
  return (
    <div className="ab-student-page">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h1 className="ab-student-greeting">{name}님, 안녕하세요!</h1>
        <span className="ab-student-badge">{classroomName}</span>
        <button className="ab-student-logout" onClick={onLogout}>로그아웃</button>
      </div>
      <p className="ab-student-sub">오늘의 보드</p>
      <div className="ab-board-grid">
        {boards.map((b) => (
          <button key={b.id} className="ab-board-card" onClick={() => onOpen(b)}>
            <div className="ab-board-emoji">{b.emoji}</div>
            <div className="ab-board-title">{b.title}</div>
            <div className="ab-board-meta">{b.layoutLabel}</div>
            {b.status && <span className={`ab-pill ab-pill-${b.status}`}>{b.statusLabel}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardView({ board, onBack, onSubmit }) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="ab-student-page">
      <button className="ab-back" onClick={onBack}>← 뒤로</button>
      <h1 className="ab-home-title" style={{ marginTop: 8 }}>{board.emoji} {board.title}</h1>
      <p className="ab-home-subtitle">{board.layoutLabel} · 제출 기한 D-3</p>

      {!submitted ? (
        <div className="ab-submit-card">
          <div className="ab-field-label">내 제출</div>
          <textarea
            className="ab-textarea"
            placeholder="오늘 읽은 책에서 가장 인상 깊었던 장면을 한 문단으로 적어 주세요."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="ab-btn-secondary" onClick={onBack}>취소</button>
            <button
              className="ab-btn-primary"
              disabled={text.trim().length < 10}
              onClick={() => { setSubmitted(true); onSubmit?.(text); }}
            >
              제출하기
            </button>
          </div>
        </div>
      ) : (
        <div className="ab-submit-card">
          <span className="ab-pill ab-pill-sub"><span className="ab-dot"></span>제출됨</span>
          <p style={{ marginTop: 12 }}>{text}</p>
          <p className="ab-micro">선생님 검토 후 알림이 전송됩니다.</p>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AuraHeader, Logo, LoginCard, StudentDashboard, BoardView });
