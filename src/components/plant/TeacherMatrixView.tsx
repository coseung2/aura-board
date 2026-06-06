"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OptimizedImage } from "../ui/OptimizedImage";
import type { ObservationDTO } from "@/types/plant";

interface Stage {
  id: string;
  order: number;
  key: string;
  nameKo: string;
  icon: string;
}
interface Cell {
  stageId: string;
  plantStageId?: string;
  thumbnail: string | null;
  observationCount: number;
  latestObs: {
    id: string;
    memo: string | null;
    observedAt: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    noPhotoReason: string | null;
  } | null;
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
  boardId?: string; // for linking to student journal pages
}

const DESKTOP_MIN = 1024;

const STUDENT_COL_WIDTH = 100;
const STAGE_COL_WIDTH = 120;

export function TeacherMatrixView({ classroomId, boardId }: Props) {
  const [viewportOk, setViewportOk] = useState<boolean | null>(null);
  const [data, setData] = useState<{ stages: Stage[]; students: StudentRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [obsDetail, setObsDetail] = useState<{
    id: string;
    plantId: string;
    stageId: string;
    stageName: string;
    studentId: string;
    studentName: string;
    studentNumber: number | null;
    memo: string | null;
    observedAt: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    noPhotoReason: string | null;
    stageOrder: number;
  } | null>(null);
  const [stageObservations, setStageObservations] = useState<ObservationDTO[]>([]);
  const [activeObservationId, setActiveObservationId] = useState<string | null>(null);
  const [observationsLoading, setObservationsLoading] = useState(false);
  const [observationsError, setObservationsError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      setViewportOk(width >= DESKTOP_MIN);
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
      .then((j) => {
        const next = { stages: j.stages, students: j.students };
        setData(next);
        setSelectedStudentId((current) => current ?? next.students[0]?.id ?? null);
      })
      .catch((e) => setErr((e as Error).message));
  }, [classroomId, viewportOk]);

  useEffect(() => {
    if (!obsDetail) {
      setStageObservations([]);
      setActiveObservationId(null);
      setObservationsLoading(false);
      setObservationsError(null);
      return;
    }

    let cancelled = false;
    setObservationsLoading(true);
    setObservationsError(null);
    setStageObservations([]);
    setActiveObservationId(obsDetail.id);
    fetch(`/api/student-plants/${obsDetail.plantId}/observations`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "관찰 기록을 불러오지 못했어요.");
        }
        return res.json() as Promise<{ observations: ObservationDTO[] }>;
      })
      .then(({ observations }) => {
        if (cancelled) return;
        const sameStage = observations.filter((obs) => obs.stageId === obsDetail.stageId);
        setStageObservations(sameStage);
        setActiveObservationId((current) =>
          current && sameStage.some((obs) => obs.id === current)
            ? current
            : (sameStage[0]?.id ?? obsDetail.id)
        );
      })
      .catch((error) => {
        if (!cancelled) setObservationsError((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setObservationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [obsDetail]);

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
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? students[0];
  const selectedStage = selectedStudent?.plant
    ? stages.find((st) => st.id === selectedStudent.plant?.currentStageId) ?? null
    : null;
  const selectedObservationTotal = selectedStudent?.cells.reduce((acc, cell) => acc + cell.observationCount, 0) ?? 0;
  const selectedPhotoStages = selectedStudent?.cells.filter((cell) => cell.thumbnail).length ?? 0;
  const classPhotoCells = students.reduce(
    (acc, student) => acc + student.cells.filter((cell) => cell.thumbnail).length,
    0
  );
  const activeObservation =
    (activeObservationId
      ? stageObservations.find((obs) => obs.id === activeObservationId)
      : stageObservations[0]) ?? null;
  const detailImageUrl = activeObservation
    ? (activeObservation.images[0]?.url ?? null)
    : (obsDetail?.imageUrl ?? null);
  const detailMemo = activeObservation ? activeObservation.memo : (obsDetail?.memo ?? null);
  const detailNoPhotoReason = activeObservation
    ? activeObservation.noPhotoReason
    : (obsDetail?.noPhotoReason ?? null);
  const detailObservedAt = activeObservation?.observedAt ?? obsDetail?.observedAt ?? "";

  function openObservationDetail(student: StudentRow, stage: Stage, cell: Cell) {
    setSelectedStudentId(student.id);
    if (!student.plant || !cell.latestObs || cell.observationCount === 0) return;
    setObsDetail({
      id: cell.latestObs.id,
      plantId: student.plant.id,
      stageId: cell.plantStageId ?? stage.id,
      stageName: stage.nameKo,
      studentId: student.id,
      studentName: student.name,
      studentNumber: student.number,
      memo: cell.latestObs.memo,
      observedAt: cell.latestObs.observedAt,
      imageUrl: cell.latestObs.imageUrl,
      thumbnailUrl: cell.latestObs.thumbnailUrl,
      noPhotoReason: cell.latestObs.noPhotoReason,
      stageOrder: stage.order,
    });
  }

  return (
    <div className="plant-matrix-shell">
      <header className="plant-matrix-toolbar">
        <div>
          <span className="plant-hero-eyebrow">Class matrix</span>
          <h2>학급 성장 매트릭스</h2>
          <p>학생 × 단계별 사진/기록을 스캔하고, 오른쪽 패널에서 바로 드릴다운해요.</p>
        </div>
        <div className="plant-matrix-toolbar-stats" aria-label="매트릭스 요약">
          <span><strong>{students.length}</strong>명</span>
          <span><strong>{stages.length}</strong>단계</span>
          <span><strong>{classPhotoCells}</strong>개 사진 셀</span>
        </div>
      </header>

      <div className="plant-matrix-layout">
        <div className="plant-matrix-wrap" >
          <table
            className="plant-matrix"
            style={{ tableLayout: "fixed", minWidth: students.length * STUDENT_COL_WIDTH + STAGE_COL_WIDTH }}
          >
            <colgroup>
              <col style={{ width: STAGE_COL_WIDTH }} />
              {students.map((s) => (
                <col key={s.id} style={{ width: STUDENT_COL_WIDTH }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>단계 \ 학생</th>
                {students.map((s) => (
                  <th
                    key={s.id}
                    title={s.plant?.nickname ?? s.name}
                    data-selected={selectedStudent?.id === s.id ? "true" : "false"}
                  >
                    <button type="button" className="plant-matrix-student-head" onClick={() => setSelectedStudentId(s.id)}>
                      <span>{s.plant?.speciesEmoji ?? "·"}</span>
                      <strong>{s.name}</strong>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.map((st, stIdx) => (
                <tr key={st.id}>
                  <th>{st.order}. {st.nameKo}</th>
                  {students.map((s) => {
                    const cell = s.cells[stIdx];
                    const freshness = cell?.thumbnail
                      ? "recent"
                      : cell && cell.observationCount > 0
                        ? "stale"
                        : "none";
                    const isSelected = selectedStudent?.id === s.id;
                    const isCurrent = s.plant?.currentStageId === st.id;
                    return (
                      <td
                        key={s.id}
                        className="plant-matrix-cell"
                        data-freshness={freshness}
                        data-selected={isSelected ? "true" : "false"}
                        data-current={isCurrent ? "true" : "false"}
                        onClick={() => openObservationDetail(s, st, cell)}
                      >
                        {cell?.thumbnail ? (
                          <button
                            type="button"
                            className="plant-matrix-photo-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openObservationDetail(s, st, cell);
                            }}
                          >
                            <img
                              src={cell.thumbnail}
                              alt={`${s.name} - ${st.nameKo}`}
                              loading="lazy"
                              decoding="async"
                            />
                          </button>
                        ) : (
                          <span className="plant-matrix-empty" aria-label="기록 없음">·</span>
                        )}
                        {isCurrent && <span className="plant-matrix-current-dot" aria-label="현재 단계" />}
                        {cell && cell.observationCount > 0 && (
                          <span className="plant-matrix-count-badge">{cell.observationCount}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="plant-matrix-drilldown" aria-label="선택 학생 상세">
          {selectedStudent ? (
            <>
              <span className="plant-hero-eyebrow">Drilldown</span>
              <h3>{selectedStudent.number ?? "—"}번 {selectedStudent.name}</h3>
              <p className="plant-matrix-drilldown-plant">
                {selectedStudent.plant
                  ? `${selectedStudent.plant.speciesEmoji} ${selectedStudent.plant.speciesName} · “${selectedStudent.plant.nickname}”`
                  : "아직 식물을 선택하지 않았어요."}
              </p>
              <div className="plant-matrix-drilldown-stats">
                <span><strong>{selectedObservationTotal}</strong>기록</span>
                <span><strong>{selectedPhotoStages}</strong>사진 단계</span>
                <span><strong>{selectedStage ? `${selectedStage.order}단계` : "대기"}</strong></span>
              </div>
              <div className="plant-matrix-mini-strip" aria-label="학생 단계별 기록 요약">
                {stages.map((st, index) => {
                  const cell = selectedStudent.cells[index];
                  return (
                    <span
                      key={st.id}
                      title={`${st.order}. ${st.nameKo}: ${cell?.observationCount ?? 0}개 기록`}
                      data-filled={cell && cell.observationCount > 0 ? "true" : "false"}
                      data-photo={cell?.thumbnail ? "true" : "false"}
                      data-current={selectedStudent.plant?.currentStageId === st.id ? "true" : "false"}
                    >
                      {st.order}
                    </span>
                  );
                })}
              </div>
              <p className="plant-matrix-drilldown-note">
                초록 셀은 사진 기록, 노란 셀은 글 기록만 있는 단계예요. 썸네일은 필요한 셀만 로드해 Vercel 이미지/함수 비용을 줄입니다.
              </p>
            </>
          ) : (
            <p className="plant-teacher-empty-copy">학생을 선택하면 상세가 보여요.</p>
          )}
        </aside>
      </div>

      {obsDetail && (
        <div className="plant-lightbox" onClick={() => setObsDetail(null)} role="dialog" aria-label="관찰 상세">
          <div className="plant-obs-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close plant-obs-detail-close"
              onClick={() => setObsDetail(null)}
              aria-label="닫기"
            >
              닫기
            </button>
            {detailImageUrl && (
              <div className="plant-obs-detail-img-wrap">
                <OptimizedImage
                  src={detailImageUrl}
                  alt={`${obsDetail.studentName} 관찰 사진`}
                  sizes="60vw"
                  fit="contain"
                />
              </div>
            )}
            <div className="plant-obs-detail-info">
              <div className="plant-obs-detail-head">
                <span className="plant-obs-detail-stage">{obsDetail.stageOrder}단계 · {obsDetail.stageName}</span>
                <span className="plant-obs-detail-student">{obsDetail.studentNumber ?? "—"}번 {obsDetail.studentName}</span>
              </div>
              {detailMemo && (
                <p className="plant-obs-detail-memo">{detailMemo}</p>
              )}
              {detailNoPhotoReason && (
                <p className="plant-obs-detail-nophoto">📝 사진 없음: {detailNoPhotoReason}</p>
              )}
              <span className="plant-obs-detail-time">
                {new Date(detailObservedAt).toLocaleString("ko-KR", {
                  year: "numeric", month: "long", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <div className="plant-obs-detail-history" aria-label="같은 단계 관찰 기록">
                <strong>이 단계 관찰 기록</strong>
                {observationsLoading && <span>불러오는 중...</span>}
                {observationsError && <span className="plant-error">{observationsError}</span>}
                {!observationsLoading && !observationsError && stageObservations.length > 0 && (
                  <div className="plant-obs-detail-history-list">
                    {stageObservations.map((obs) => {
                      const thumb = obs.images[0]?.thumbnailUrl ?? obs.images[0]?.url ?? null;
                      return (
                        <button
                          key={obs.id}
                          type="button"
                          className="plant-obs-detail-history-item"
                          data-active={obs.id === (activeObservation?.id ?? obsDetail.id) ? "true" : "false"}
                          onClick={() => setActiveObservationId(obs.id)}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="plant-obs-detail-history-empty">메모</span>
                          )}
                          <span>
                            {new Date(obs.observedAt).toLocaleString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {boardId && (
                <Link
                  href={`/board/${boardId}/student/${obsDetail.studentId}`}
                  className="ds-btn-secondary"
                  style={{ padding: "8px 16px", fontSize: 13, width: "100%", textAlign: "center" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  학생 화면 보기
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

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
