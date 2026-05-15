"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OptimizedImage } from "../ui/OptimizedImage";

interface Stage {
  id: string;
  order: number;
  key: string;
  nameKo: string;
  icon: string;
}
interface Cell {
  stageId: string;
  thumbnail: string | null;
  observationCount: number;
}
interface StudentRow {
  id: string;
  name: string;
  number: number | null;
  plant: {
    id: string;
    speciesId: string;
    nickname: string;
    currentStageId: string;
    speciesEmoji: string;
    speciesName: string;
  } | null;
  cells: Cell[];
}

interface Props {
  classroomId: string;
}

const DESKTOP_MIN = 768;

// Simple column virtualization — render only visible column range + overscan.
const DESKTOP_COL_WIDTH = 100; // th/td width approx
const COMPACT_COL_WIDTH = 60;
const STAGE_COL_WIDTH = 120;
const OVERSCAN = 3;

export function TeacherMatrixView({ classroomId }: Props) {
  const [viewportOk, setViewportOk] = useState<boolean | null>(null);
  const [compact, setCompact] = useState(false);
  const [data, setData] = useState<{ stages: Stage[]; students: StudentRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const [viewportW, setViewportW] = useState(0);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      setViewportOk(width >= DESKTOP_MIN);
      setCompact(width >= DESKTOP_MIN && width < 1024);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!viewportOk) return;
    const clientWidth = String(window.innerWidth);
    fetch(`/api/classrooms/${classroomId}/matrix`, {
      headers: { "x-client-width": clientWidth },
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error ?? "매트릭스 로드 실패");
        }
        return r.json();
      })
      .then((j) => setData({ stages: j.stages, students: j.students }))
      .catch((e) => setErr((e as Error).message));
  }, [classroomId, viewportOk]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollX(el.scrollLeft);
    const onResize = () => setViewportW(el.clientWidth);
    onResize();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [data]);

  const colWidth = compact ? COMPACT_COL_WIDTH : DESKTOP_COL_WIDTH;

  const visibleRange = useMemo(() => {
    const students = data?.students ?? [];
    if (students.length === 0 || viewportW === 0) {
      return { start: 0, end: students.length };
    }
    const start = Math.max(0, Math.floor(scrollX / colWidth) - OVERSCAN);
    const cols = Math.ceil(viewportW / colWidth) + OVERSCAN * 2;
    const end = Math.min(students.length, start + cols);
    return { start, end };
  }, [scrollX, viewportW, data, colWidth]);

  if (viewportOk === null) {
    return <div className="plant-matrix-forbidden"><p>확인 중…</p></div>;
  }
  if (!viewportOk) {
    return (
      <div className="plant-matrix-forbidden">
        <h3>이 뷰는 태블릿 이상 화면에서 열 수 있어요</h3>
        <p style={{ color: "var(--color-text-muted)" }}>
          휴대폰에서는 셀이 너무 작아 보여요. 태블릿, 노트북 또는 데스크탑에서 다시 열어주세요.
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="plant-matrix-forbidden">
        <h3>매트릭스를 불러올 수 없어요</h3>
        <p className="plant-error">{err}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="plant-matrix-wrap"><p>불러오는 중…</p></div>;
  }

  const { stages, students } = data;

  if (students.length === 0 || stages.length === 0) {
    return <div className="plant-empty-state">아직 학생이 없거나 식물을 선택한 학생이 없어요.</div>;
  }

  // Virtualized visible slice
  const visibleStudents = students.slice(visibleRange.start, visibleRange.end);
  const leftPad = visibleRange.start * colWidth;
  const rightPad = (students.length - visibleRange.end) * colWidth;

  return (
    <div className="plant-matrix-wrap" ref={scrollRef}>
      <table
        className="plant-matrix"
        style={{ tableLayout: "fixed", minWidth: leftPad + visibleStudents.length * colWidth + rightPad + STAGE_COL_WIDTH }}
      >
        <colgroup>
          <col style={{ width: STAGE_COL_WIDTH }} />
          {leftPad > 0 && <col style={{ width: leftPad }} />}
          {visibleStudents.map((s) => (
            <col key={s.id} style={{ width: colWidth }} />
          ))}
          {rightPad > 0 && <col style={{ width: rightPad }} />}
        </colgroup>
        <thead>
          <tr>
            <th>단계 \ 학생</th>
            {leftPad > 0 && <th aria-hidden />}
            {visibleStudents.map((s) => (
              <th key={s.id} title={s.plant?.nickname ?? s.name}>
                <div style={{ fontSize: 14 }}>{s.plant?.speciesEmoji ?? "·"}</div>
                <div>{s.name}</div>
              </th>
            ))}
            {rightPad > 0 && <th aria-hidden />}
          </tr>
        </thead>
        <tbody>
          {stages.map((st, stIdx) => (
            <tr key={st.id}>
              <th>{st.order}. {st.nameKo}</th>
              {leftPad > 0 && <td aria-hidden />}
              {visibleStudents.map((s) => {
                const cell = s.cells[stIdx];
                const freshness = cell?.thumbnail
                  ? "recent"
                  : cell && cell.observationCount > 0
                    ? "stale"
                    : "none";
                return (
                  <td key={s.id} className="plant-matrix-cell" data-freshness={freshness}>
                    {cell?.thumbnail ? (
                      <img
                        src={cell.thumbnail}
                        alt={`${s.name} - ${st.nameKo}`}
                        onClick={() => setLightbox(cell.thumbnail)}
                      />
                    ) : (
                      <span className="plant-matrix-empty" aria-label="기록 없음">·</span>
                    )}
                    {cell && cell.observationCount > 0 && (
                      <span className="plant-matrix-count-badge">{cell.observationCount}</span>
                    )}
                  </td>
                );
              })}
              {rightPad > 0 && <td aria-hidden />}
            </tr>
          ))}
        </tbody>
      </table>

      {lightbox && (
        <div className="plant-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="사진 원본">
          <div className="plant-lightbox-frame optimized-img-wrap">
            <OptimizedImage
              src={lightbox}
              alt="관찰 사진"
              sizes="90vw"
              priority
              fit="contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
