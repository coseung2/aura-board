"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardSection } from "./types";

export function BreakoutTab({
  boardId,
  title,
  layout,
  classrooms,
  classroomId,
  sections,
  streamSectionsEnabled,
  streamTitlePrompt,
  streamContentPrompt,
  onTokenChange,
}: {
  boardId: string;
  title: string;
  layout: string;
  classrooms: Array<{ id: string; name: string; studentCount: number }>;
  classroomId: string | null;
  sections: BoardSection[];
  streamSectionsEnabled: boolean;
  streamTitlePrompt: string;
  streamContentPrompt: string;
  onTokenChange: (sectionId: string, token: string | null) => void;
}) {
  if (layout === "stream") {
    return (
      <StreamBreakoutCreator
        boardId={boardId}
        title={title}
        classrooms={classrooms}
        classroomId={classroomId}
        sections={sections}
        streamSectionsEnabled={streamSectionsEnabled}
        streamTitlePrompt={streamTitlePrompt}
        streamContentPrompt={streamContentPrompt}
      />
    );
  }

  if (layout !== "columns") {
    return (
      <div className="board-settings-empty">
        <p>
          이 레이아웃에는 섹션이 없어요.
          <br />
          주제별 보드에서만 브레이크아웃 링크를 만들 수 있어요.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="board-settings-empty">
        <p>
          섹션을 먼저 추가해 주세요.
          <br />
          보드의 <strong>+ 섹션 추가</strong> 버튼으로 만들 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="board-settings-list">
        {sections.map((section) => (
          <BreakoutSectionRow
            key={section.id}
            boardId={boardId}
            section={section}
            onTokenChange={onTokenChange}
          />
        ))}
      </div>
      <div className="board-settings-archive-link">
        <a href={`/board/${boardId}/archive`}>지난 세션 아카이브 보기</a>
      </div>
    </>
  );
}

function BreakoutSectionRow({
  boardId,
  section,
  onTokenChange,
}: {
  boardId: string;
  section: BoardSection;
  onTokenChange: (sectionId: string, token: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const inputId = useId();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const token = section.accessToken;
  const sharePath = token
    ? `/board/${boardId}/s/${section.id}?token=${encodeURIComponent(token)}`
    : "";
  const absolute = sharePath ? (origin ? `${origin}${sharePath}` : sharePath) : "";

  async function mutate(confirmMessage: string | null) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/sections/${section.id}/share`, {
        method: "POST",
      });
      if (!res.ok) {
        setStatus("생성 실패");
        return;
      }
      const data = await res.json();
      const next = data.section?.accessToken ?? null;
      onTokenChange(section.id, next);
      setStatus("링크가 생성되었어요.");
    } catch {
      setStatus("생성 실패");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!absolute) return;
    try {
      await navigator.clipboard.writeText(absolute);
      setStatus("복사했어요.");
      window.setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("복사에 실패했어요. 수동으로 복사해 주세요.");
    }
  }

  return (
    <article className="board-settings-row">
      <header className="board-settings-row-title">
        <span className="board-settings-row-name">{section.title}</span>
        <span
          className={`board-settings-row-badge ${token ? "on" : "off"}`}
          aria-label={token ? "공유 링크 있음" : "공유 링크 없음"}
        >
          {token ? "링크 있음" : "링크 없음"}
        </span>
      </header>
      {token ? (
        <div className="share-actions">
          <input
            id={inputId}
            className="share-url-input"
            type="text"
            readOnly
            value={absolute}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`${section.title} 공유 URL`}
          />
          <button
            type="button"
            className="column-add-btn"
            onClick={copy}
            disabled={busy}
          >
            복사
          </button>
          <button
            type="button"
            className="column-inline-add"
            onClick={() =>
              mutate("새 링크를 만들면 이전 링크는 즉시 무효화돼요. 진행할까요?")
            }
            disabled={busy}
          >
            새로 발급
          </button>
        </div>
      ) : (
        <div className="share-actions">
          <button
            type="button"
            className="column-add-btn"
            onClick={() => mutate(null)}
            disabled={busy}
          >
            {busy ? "생성 중..." : "공유 링크 생성"}
          </button>
        </div>
      )}
      <p className="share-status" aria-live="polite">
        {status}
      </p>
    </article>
  );
}

function StreamBreakoutCreator({
  boardId,
  title,
  classrooms,
  classroomId,
  sections,
  streamSectionsEnabled,
  streamTitlePrompt,
  streamContentPrompt,
}: {
  boardId: string;
  title: string;
  classrooms: Array<{ id: string; name: string; studentCount: number }>;
  classroomId: string | null;
  sections: BoardSection[];
  streamSectionsEnabled: boolean;
  streamTitlePrompt: string;
  streamContentPrompt: string;
}) {
  const router = useRouter();
  const [groupCount, setGroupCount] = useState(4);
  const [groupCapacity, setGroupCapacity] = useState(6);
  const [visibility, setVisibility] = useState<"own-only" | "peek-others">(
    "own-only",
  );
  const [targetClassroomId, setTargetClassroomId] = useState(classroomId ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const sectionCount = streamSectionsEnabled && sections.length > 0 ? sections.length : 1;
  const hasPrompt = Boolean(streamTitlePrompt.trim() || streamContentPrompt.trim());

  async function createBreakout() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/boards/${boardId}/breakout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupCount,
          groupCapacity,
          visibilityOverride: visibility,
          classroomId: targetClassroomId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(`생성 실패: ${data.error ?? res.status}`);
        return;
      }
      const data = (await res.json()) as { board?: { slug?: string; id?: string } };
      const next = data.board?.id ?? data.board?.slug;
      if (next) router.push(`/board/${encodeURIComponent(next)}`);
    } catch {
      setStatus("생성 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board-settings-control-stack">
      <div className="board-settings-row">
        <div className="board-settings-row-title">
          <span className="board-settings-row-name">
            {title || "제목 없음"} 브레이크아웃
          </span>
          <span className="board-settings-row-badge on">
            {groupCount}모둠
          </span>
        </div>
        <p className="board-settings-row-note">
          현재 스트림 양식의 섹션 {sectionCount}개와 글쓰기 안내
          {hasPrompt ? "" : " 없이"}를 모둠별로 복제합니다.
        </p>
      </div>

      <label className="modal-field-label" htmlFor={`breakout-group-count-${boardId}`}>
        모둠 수
      </label>
      <input
        id={`breakout-group-count-${boardId}`}
        type="number"
        min={1}
        max={10}
        className="modal-input"
        value={groupCount}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) setGroupCount(Math.max(1, Math.min(10, value)));
        }}
        disabled={busy}
      />

      <label className="modal-field-label" htmlFor={`breakout-capacity-${boardId}`}>
        모둠 정원
      </label>
      <input
        id={`breakout-capacity-${boardId}`}
        type="number"
        min={1}
        max={6}
        className="modal-input"
        value={groupCapacity}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) setGroupCapacity(Math.max(1, Math.min(6, value)));
        }}
        disabled={busy}
      />

      <label className="modal-field-label" htmlFor={`breakout-visibility-${boardId}`}>
        열람 방식
      </label>
      <select
        id={`breakout-visibility-${boardId}`}
        className="modal-select"
        value={visibility}
        onChange={(event) =>
          setVisibility(event.target.value as "own-only" | "peek-others")
        }
        disabled={busy}
      >
        <option value="own-only">자기 모둠만</option>
        <option value="peek-others">다른 모둠도 보기</option>
      </select>

      {classrooms.length > 0 && (
        <>
          <label className="modal-field-label" htmlFor={`breakout-classroom-${boardId}`}>
            학급 연결
          </label>
          <select
            id={`breakout-classroom-${boardId}`}
            className="modal-select"
            value={targetClassroomId}
            onChange={(event) => setTargetClassroomId(event.target.value)}
            disabled={busy}
          >
            <option value="">학급 연결 없음</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name} (학생 {classroom.studentCount}명)
              </option>
            ))}
          </select>
        </>
      )}

      <div className="stream-guidance-actions">
        <button
          type="button"
          className="stream-guidance-save"
          onClick={() => void createBreakout()}
          disabled={busy}
        >
          {busy ? "만드는 중..." : "브레이크아웃 만들기"}
        </button>
        {status && (
          <span className="stream-guidance-error" aria-live="polite">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
