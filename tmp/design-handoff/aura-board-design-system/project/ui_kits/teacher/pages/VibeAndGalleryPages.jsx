/* global React */
const { useState, useMemo, useEffect, useRef } = React;

/* ───────────── Vibe Coding Board ─────────────
   학생이 자기 슬롯에서 HTML/CSS/JS 코드를 편집하고 즉시 iframe 프리뷰.
   - 상단 필터: 내 작업 / 전체 / 선생님 피드백 대기
   - 카드 클릭 시 라이트 에디터 모달 열림 (코드 3탭 + 프리뷰 + Claude 힌트)
   - 제출하면 Gallery 보드에 자동으로 올라감 (onSubmitToGallery 콜백) */

const SEED_VIBES = [
  {
    id: "v1", author: "김재민", emoji: "🌸",
    title: "벚꽃 떨어지는 배경",
    status: "in-progress",
    html: "<div class='sky'>\n  <h1>봄 왔다</h1>\n  <div class='petals'></div>\n</div>",
    css: ".sky { height: 100%; background: linear-gradient(#ffe3ec,#fff); display:flex; align-items:center; justify-content:center; font-family: system-ui; }\nh1 { font-size: 48px; color:#c45b7a; letter-spacing:-1px; }",
    js: "// 꽃잎 하나 그리기\nconst p = document.querySelector('.petals');\nfor (let i=0;i<20;i++){ const s=document.createElement('span'); s.textContent='🌸'; s.style.cssText='position:absolute;top:'+Math.random()*80+'%;left:'+Math.random()*100+'%;font-size:'+(14+Math.random()*22)+'px'; document.body.appendChild(s); }",
  },
  {
    id: "v2", author: "이수연", emoji: "🎮",
    title: "클릭 점수 올리기 게임",
    status: "in-progress",
    html: "<button id='b'>눌러봐 (0)</button>",
    css: "body{display:grid;place-items:center;height:100%;margin:0;font-family:system-ui;background:#0e1220;color:#fff}\n#b{padding:20px 36px;font-size:20px;border-radius:9999px;border:none;background:#a69bff;color:#fff;cursor:pointer;font-weight:700}",
    js: "let n=0; const b=document.getElementById('b'); b.onclick=()=>{n++; b.textContent='눌러봐 ('+n+')'; b.style.transform='scale('+(1+n*0.02)+')'}",
  },
  {
    id: "v3", author: "박도윤", emoji: "🌍",
    title: "지구 자전 애니메이션",
    status: "needs-review",
    html: "<div class='earth'>🌍</div>",
    css: "body{background:#000;height:100%;margin:0;display:grid;place-items:center}\n.earth{font-size:140px;animation:spin 4s linear infinite}\n@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}",
    js: "",
  },
  {
    id: "v4", author: "최하윤", emoji: "💌",
    title: "친구에게 쪽지 보내기",
    status: "submitted",
    html: "<form><label>받는 사람</label><input placeholder='친구 이름'><label>메시지</label><textarea rows='4'></textarea><button>보내기</button></form>",
    css: "body{font-family:system-ui;padding:20px;background:#fff}\nform{display:flex;flex-direction:column;gap:8px;max-width:320px}\ninput,textarea{padding:8px;border:1px solid #ddd;border-radius:6px;font:inherit}\nbutton{padding:10px;background:#0075de;color:#fff;border:none;border-radius:6px;font-weight:600}",
    js: "document.querySelector('form').onsubmit=(e)=>{e.preventDefault(); alert('쪽지를 보냈어요!')}",
  },
  {
    id: "v5", author: "정유진", emoji: "🎨",
    title: "무지개 그라디언트 텍스트",
    status: "in-progress",
    html: "<h1>예술은 즐거워</h1>",
    css: "body{display:grid;place-items:center;height:100%;background:#111;margin:0}\nh1{font-size:56px;font-weight:900;background:linear-gradient(90deg,#ff006e,#ffbe0b,#8ac926,#3a86ff,#8338ec);-webkit-background-clip:text;background-clip:text;color:transparent;font-family:system-ui}",
    js: "",
  },
  {
    id: "v6", author: "한서준", emoji: "⚡",
    title: "빈 슬롯",
    status: "empty",
    html: "<h1>여기에 뭔가 만들어보자!</h1>",
    css: "body{display:grid;place-items:center;height:100%;font-family:system-ui;color:#999}",
    js: "",
  },
];

const STATUS_META = {
  "empty": { label: "빈 슬롯", color: "var(--color-text-faint)", bg: "transparent" },
  "in-progress": { label: "작업 중", color: "#1565c0", bg: "#f2f9ff" },
  "needs-review": { label: "선생님 피드백 대기", color: "#92610a", bg: "#fef3c7" },
  "submitted": { label: "갤러리에 제출됨", color: "#2e7d32", bg: "#e8f5e9" },
};

function buildSrcDoc({ html, css, js }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;}${css||""}</style></head><body>${html||""}<script>try{${js||""}}catch(e){document.body.innerHTML+='<pre style=\\'color:#c62828;padding:12px;font:12px/1.4 ui-monospace\\'>'+e.message+'</pre>'}<\/script></body></html>`;
}

/* ── Editor modal ─────────────────────────────────────────── */
function VibeEditor({ item, onClose, onSave, onSubmitToGallery }) {
  const [title, setTitle] = useState(item.title);
  const [html, setHtml] = useState(item.html || "");
  const [css, setCss] = useState(item.css || "");
  const [js, setJs] = useState(item.js || "");
  const [messages, setMessages] = useState(() => [
    { role: "assistant", text: "어떤 걸 만들고 싶은지 말로 알려줘! 예: '별이 반짝거리는 밤하늘'" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy]);

  const srcDoc = useMemo(() => buildSrcDoc({ html, css, js }), [html, css, js]);

  async function sendPrompt() {
    const text = input.trim();
    if (!text || busy) return;
    const nextMsgs = [...messages, { role: "user", text }];
    setMessages(nextMsgs); setInput(""); setBusy(true);

    const sys = `너는 초등학생의 바이브 코딩 도우미야. 학생이 말로 설명하면 HTML/CSS/JS 코드를 만들어져. 현재 코드가 있으면 기반으로 수정/추가해줘.\n\n중요: 응답은 반드시 중괄호 JSON만 반환해. 설명 텍스트 금지. 형식:\n{"message":"학생에게 한 문장으로 한국어로 설명","html":"...","css":"...","js":"..."}\n\n현재 작품:\nHTML: ${html}\nCSS: ${css}\nJS: ${js}\n\n학생 요청: ${text}`;

    try {
      const raw = await window.claude.complete(sys);
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : null;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.html === "string") setHtml(parsed.html);
        if (typeof parsed.css === "string") setCss(parsed.css);
        if (typeof parsed.js === "string") setJs(parsed.js);
        setMessages([...nextMsgs, { role: "assistant", text: parsed.message || "만들었어! 오른쪽에서 확인해봐." }]);
      } else {
        setMessages([...nextMsgs, { role: "assistant", text: raw }]);
      }
    } catch (e) {
      setMessages([...nextMsgs, { role: "assistant", text: "어? 잠시 문제가 생겼어. 다시 말해줄래?" }]);
    } finally { setBusy(false); }
  }

  function save(status) { onSave({ ...item, title, html, css, js, status }); }

  return (
    <div className="ab-modal-backdrop" onClick={onClose}>
      <div className="ab-vibe-editor" onClick={(e) => e.stopPropagation()}>
        <header className="ab-vibe-editor-head">
          <input className="ab-vibe-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="작품 제목" />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ab-btn-secondary" onClick={() => { save("in-progress"); onClose(); }}>임시 저장</button>
            <button className="ab-btn-secondary" onClick={() => { save("needs-review"); onClose(); }}>선생님께 피드백 요청</button>
            <button className="ab-btn-primary" onClick={() => { const saved = { ...item, title, html, css, js, status: "submitted" }; onSave(saved); onSubmitToGallery(saved); onClose(); }}>🎉 갤러리에 제출</button>
            <button className="ab-icon-btn" onClick={onClose} title="닫기">✕</button>
          </div>
        </header>

        <div className="ab-vibe-editor-body">
          <section className="ab-vibe-chat">
            <div ref={logRef} className="ab-vibe-chatlog">
              {messages.map((m, i) => (
                <div key={i} className={`ab-vibe-msg ab-vibe-msg-${m.role}`}>
                  <span className="ab-vibe-msg-who">{m.role === "user" ? "나" : "✨ Claude"}</span>
                  <div className="ab-vibe-msg-text">{m.text}</div>
                </div>
              ))}
              {busy && (
                <div className="ab-vibe-msg ab-vibe-msg-assistant">
                  <span className="ab-vibe-msg-who">✨ Claude</span>
                  <div className="ab-vibe-msg-text ab-vibe-typing">•••</div>
                </div>
              )}
            </div>
            <div className="ab-vibe-composer">
              <textarea
                className="ab-vibe-composer-input"
                rows={2}
                placeholder="만들고 싶은 걸 말로 설명해봐... (Enter로 전송, Shift+Enter로 줄바꿈)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); } }}
                disabled={busy}
              />
              <button className="ab-btn-primary" onClick={sendPrompt} disabled={busy || !input.trim()}>전송</button>
            </div>
          </section>
          <section className="ab-vibe-preview">
            <div className="ab-vibe-preview-head">라이브 프리뷰</div>
            <iframe title="preview" className="ab-vibe-preview-frame" sandbox="allow-scripts" srcDoc={srcDoc} />
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── Card tile ────────────────────────────────────────────── */
function VibeTile({ item, onOpen }) {
  const srcDoc = useMemo(() => buildSrcDoc(item), [item]);
  const s = STATUS_META[item.status];
  const isEmpty = item.status === "empty";
  return (
    <button className={`ab-vibe-tile${isEmpty ? " empty" : ""}`} onClick={() => onOpen(item)}>
      <div className="ab-vibe-tile-preview">
        {isEmpty ? (
          <div className="ab-vibe-empty-inner">
            <span style={{ fontSize: 36, display: "block", marginBottom: 6 }}>+</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>여기에 만들어보기</span>
          </div>
        ) : (
          <>
            <iframe title={item.title} sandbox="allow-scripts" srcDoc={srcDoc} />
            <span className="ab-vibe-tile-emoji">{item.emoji}</span>
          </>
        )}
      </div>
      <div className="ab-vibe-tile-meta">
        <div className="ab-vibe-tile-title">{item.title}</div>
        <div className="ab-vibe-tile-sub">
          <span
            className="ab-roster-avatar"
            style={{ width: 18, height: 18, fontSize: 10, background: "var(--color-surface-alt)", color: "var(--color-text)" }}
          >{item.author[0]}</span>
          <span>{item.author}</span>
          <span className="ab-vibe-tile-status" style={{ color: s.color, background: s.bg }}>{s.label}</span>
        </div>
      </div>
    </button>
  );
}

function VibeCodingBoardPage({ onBack, vibes, setVibes, publishToGallery }) {
  const [filter, setFilter] = useState("all");
  const [openItem, setOpenItem] = useState(null);

  const filtered = useMemo(() => {
    if (filter === "review") return vibes.filter((v) => v.status === "needs-review");
    if (filter === "submitted") return vibes.filter((v) => v.status === "submitted");
    if (filter === "in-progress") return vibes.filter((v) => v.status === "in-progress");
    return vibes;
  }, [vibes, filter]);

  function saveItem(next) {
    setVibes((vs) => {
      if (vs.some((v) => v.id === next.id)) return vs.map((v) => v.id === next.id ? next : v);
      return [next, ...vs];
    });
  }

  return (
    <div className="ab-page-shell">
      <div className="ab-header">
        <div>
          <button className="ab-back" onClick={onBack}>← 내 보드</button>
          <h1 className="ab-home-title" style={{ marginTop: 4 }}>⚡ 바이브 코딩 스튜디오</h1>
          <p className="ab-home-subtitle">HTML · CSS · JS 한 번에 · 학생별 슬롯 · 갤러리 제출 시 공개됨</p>
        </div>
        <div className="ab-header-actions">
          <div className="ab-vibe-filter">
            {[
              { id: "all", label: "전체" },
              { id: "in-progress", label: "작업 중" },
              { id: "review", label: "피드백 대기" },
              { id: "submitted", label: "제출됨" },
            ].map((f) => (
              <button
                key={f.id}
                className={`ab-vibe-filter-btn${filter === f.id ? " active" : ""}`}
                onClick={() => setFilter(f.id)}
              >{f.label}</button>
            ))}
          </div>
          <button className="ab-btn-primary" onClick={() => setOpenItem({
            id: "new-" + Date.now(), author: "나", emoji: "✨",
            title: "새 작품", status: "in-progress",
            html: "<h1>안녕!</h1>\n<p>여기에 내 작품을 만들어보자.</p>\n<button>눌러봐</button>",
            css: "body { font-family: system-ui; padding: 24px; background: #fff8f0; }\nh1 { color: #c45b7a; font-size: 32px; letter-spacing: -0.5px; }\nbutton { padding: 10px 20px; border: none; background: #a69bff; color: #fff; border-radius: 9999px; font-size: 14px; font-weight: 600; cursor: pointer; }",
            js: "document.querySelector('button').onclick = () => alert('안녕하세요!');",
            _isNew: true,
          })}>
            ✨ 새 작업 시작
          </button>
        </div>
      </div>

      <div className="ab-vibe-grid">
        {filtered.map((v) => <VibeTile key={v.id} item={v} onOpen={setOpenItem} />)}
        {filtered.length === 0 && <div className="ab-empty" style={{ gridColumn: "1/-1" }}>해당 필터에 작품이 없습니다.</div>}
      </div>

      {openItem && (
        <VibeEditor
          item={openItem}
          onClose={() => setOpenItem(null)}
          onSave={saveItem}
          onSubmitToGallery={(v) => publishToGallery(v)}
          onRequestReview={() => {}}
        />
      )}
    </div>
  );
}

/* ───────────── Gallery Board ─────────────
   갤러리에 제출된 작품 모음. 타일 클릭 → 라이트박스 (라이브 실행 + 좌우 네비 + 전체화면) */

function GalleryBoardPage({ onBack, items }) {
  const [open, setOpen] = useState(null); // id
  const [isFs, setIsFs] = useState(false);
  const fsRef = useRef(null);

  const idx = open ? items.findIndex((x) => x.id === open) : -1;
  const cur = idx >= 0 ? items[idx] : null;
  const srcDoc = useMemo(() => cur ? buildSrcDoc(cur) : "", [cur]);

  useEffect(() => {
    function onKey(e) {
      if (!cur) return;
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowLeft" && idx > 0) setOpen(items[idx-1].id);
      else if (e.key === "ArrowRight" && idx < items.length - 1) setOpen(items[idx+1].id);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    function onFs() { setIsFs(document.fullscreenElement === fsRef.current); }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFs() {
    const el = fsRef.current; if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  }

  return (
    <div className="ab-page-shell">
      <div className="ab-header">
        <div>
          <button className="ab-back" onClick={onBack}>← 내 보드</button>
          <h1 className="ab-home-title" style={{ marginTop: 4 }}>🖼 반 갤러리</h1>
          <p className="ab-home-subtitle">바이브 코딩 작품 {items.length}개 전시 중 · 클릭해서 큰 화면으로 감상</p>
        </div>
        <div className="ab-header-actions">
          <button className="ab-btn-secondary">필터 · 이번 주</button>
          <button className="ab-btn-secondary">공유 링크</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="ab-empty">아직 제출된 작품이 없습니다. 학생들에게 바이브 코딩 스튜디오에서 제출하라고 안내해주세요.</div>
      ) : (
        <div className="ab-gallery-grid">
          {items.map((it) => (
            <button key={it.id} className="ab-gallery-tile" onClick={() => setOpen(it.id)}>
              <div className="ab-gallery-frame">
                <iframe title={it.title} sandbox="allow-scripts" srcDoc={buildSrcDoc(it)} />
                <span className="ab-gallery-tile-emoji">{it.emoji}</span>
              </div>
              <div className="ab-gallery-caption">
                <div className="ab-gallery-title">{it.title}</div>
                <div className="ab-gallery-author">{it.author}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {cur && (
        <div className="ab-modal-backdrop ab-gallery-lightbox" onClick={() => setOpen(null)}>
          <button
            className="ab-card-nav ab-card-nav-prev"
            disabled={idx <= 0}
            onClick={(e) => { e.stopPropagation(); if (idx > 0) setOpen(items[idx-1].id); }}
            title="이전 (←)"
          >‹</button>
          <div
            ref={fsRef}
            className={`ab-gallery-stage${isFs ? " fs" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ab-gallery-stage-head">
              <div>
                <div className="ab-gallery-stage-title">{cur.title}</div>
                <div className="ab-gallery-stage-sub">{cur.author} · {idx+1} / {items.length}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ab-icon-btn" onClick={() => setOpen(null)} title="닫기 (Esc)">✕</button>
              </div>
            </header>
            <iframe className="ab-gallery-stage-frame" title={cur.title} sandbox="allow-scripts" srcDoc={srcDoc} />
            <button className="ab-card-fs" onClick={toggleFs} title="전체화면">{isFs ? "⛶ 종료" : "⛶ 전체화면"}</button>
          </div>
          <button
            className="ab-card-nav ab-card-nav-next"
            disabled={idx >= items.length - 1}
            onClick={(e) => { e.stopPropagation(); if (idx < items.length - 1) setOpen(items[idx+1].id); }}
            title="다음 (→)"
          >›</button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { VibeCodingBoardPage, GalleryBoardPage, SEED_VIBES });
