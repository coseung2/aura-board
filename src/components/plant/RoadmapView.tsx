"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ObservationDTO, StageDTO, StudentPlantDTO } from "@/types/plant";
import { STALL_THRESHOLD_DAYS } from "@/lib/plant-schemas";
import { ObservationEditor } from "./ObservationEditor";
import { NoPhotoReasonModal } from "./NoPhotoReasonModal";
import { OptimizedImage } from "../ui/OptimizedImage";

interface Props {
  plant: StudentPlantDTO;
  canEdit: boolean;
  /**
   * When true, "관찰 추가" CTA is shown on every stage (teacher drill-down mode).
   * Defaults to false — student mode only composes on the current stage.
   */
  editAnyStage?: boolean;
  onPlantUpdated: (next: StudentPlantDTO) => void;
}

export function RoadmapView({
  plant,
  canEdit,
  editAnyStage = false,
  onPlantUpdated,
}: Props) {
  const [editorStageId, setEditorStageId] = useState<string | null>(null);
  const [editingObs, setEditingObs] = useState<ObservationDTO | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [busyAdvance, setBusyAdvance] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [compareStageId, setCompareStageId] = useState<string | null>(null);
  const [comparePos, setComparePos] = useState(50);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const stages = plant.species.stages;
  const currentStage = stages.find((s) => s.id === plant.currentStageId) ?? stages[0];
  const currentOrder = currentStage?.order ?? 0;

  const observationsByStage = useMemo(() => {
    const map = new Map<string, ObservationDTO[]>();
    for (const o of plant.observations) {
      const arr = map.get(o.stageId) ?? [];
      arr.push(o);
      map.set(o.stageId, arr);
    }
    return map;
  }, [plant.observations]);

  const photosOnCurrentStage = useMemo(() => {
    const obs = observationsByStage.get(currentStage?.id ?? "") ?? [];
    return obs.reduce((acc, o) => acc + o.images.length, 0);
  }, [observationsByStage, currentStage]);

  const currentStageObservations = observationsByStage.get(currentStage?.id ?? "") ?? [];
  const totalPhotos = useMemo(
    () => plant.observations.reduce((acc, o) => acc + o.images.length, 0),
    [plant.observations]
  );
  const progressPercent = stages.length
    ? Math.round((currentOrder / stages.length) * 100)
    : 0;
  const missionPoints = currentStage?.observationPoints.slice(0, 3) ?? [];

  const stageState = useCallback(
    (order: number): "visited" | "active" | "upcoming" => {
      if (order < currentOrder) return "visited";
      if (order === currentOrder) return "active";
      return "upcoming";
    },
    [currentOrder]
  );

  /** ② 미관찰 리마인더: 마지막 관찰로부터 경과일 계산 */
  const daysSinceLastObs = useMemo(() => {
    const allObs = plant.observations;
    if (allObs.length === 0) return null;
    const latestMs = Math.max(...allObs.map((o) => new Date(o.observedAt).getTime()));
    return Math.floor((Date.now() - latestMs) / (24 * 60 * 60 * 1000));
  }, [plant.observations]);

  const lastObservedLabel = daysSinceLastObs === null
    ? "첫 관찰 대기"
    : daysSinceLastObs === 0
      ? "오늘 관찰 완료"
      : `${daysSinceLastObs}일 전 관찰`;

  /** ① 방금 단계 이동했는지 (축하 배지 표시용) */
  const justAdvanced = useRef(false);

  async function refreshPlant() {
    const res = await fetch(`/api/student-plants/${plant.id}`);
    if (!res.ok) return;
    const j = await res.json();
    if (j?.studentPlant) onPlantUpdated(j.studentPlant as StudentPlantDTO);
  }

  async function handleCreateObservation(payload: { memo: string; images: { url: string }[] }) {
    if (!editorStageId) return;
    const res = await fetch(`/api/student-plants/${plant.id}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stageId: editorStageId,
        memo: payload.memo,
        images: payload.images,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "저장 실패");
    }
    await refreshPlant();
    setEditorStageId(null);
    setEditingObs(null);
  }

  async function handlePatchObservation(obsId: string, payload: { memo: string; images: { url: string }[] }) {
    const res = await fetch(`/api/student-plants/${plant.id}/observations/${obsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "수정 실패");
    }
    await refreshPlant();
    setEditorStageId(null);
    setEditingObs(null);
  }

  async function handleDeleteObservation(obs: ObservationDTO) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    const res = await fetch(`/api/student-plants/${plant.id}/observations/${obs.id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error ?? "삭제 실패");
      return;
    }
    await refreshPlant();
  }

  /** ①⑦ 단계 이동 + 축하 + 자동스크롤 */
  async function handleAdvanceRequest() {
    setBusyAdvance(true);
    try {
      const res = await fetch(`/api/student-plants/${plant.id}/advance-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await refreshPlant();
        justAdvanced.current = true;
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 3000);
        // ⑦ 자동 스크롤
        setTimeout(() => {
          document.querySelector('[data-state="active"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (j?.error === "require_reason") {
        setReasonError(null);
        setReasonOpen(true);
        return;
      }
      alert(j?.message ?? j?.error ?? "다음 단계 이동 실패");
    } finally {
      setBusyAdvance(false);
    }
  }

  async function handleReasonSubmit(reason: string) {
    setBusyAdvance(true);
    setReasonError(null);
    try {
      const res = await fetch(`/api/student-plants/${plant.id}/advance-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noPhotoReason: reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setReasonError(j?.message ?? j?.error ?? "사유 저장 실패");
        return;
      }
      await refreshPlant();
      setReasonOpen(false);
    } finally {
      setBusyAdvance(false);
    }
  }

  /** ③ 클릭투에디트 별명 */
  function startNicknameEdit() {
    if (!canEdit) return;
    setNicknameDraft(plant.nickname);
    setIsEditingNickname(true);
    setTimeout(() => nicknameInputRef.current?.focus(), 0);
  }

  async function saveNickname() {
    const trimmed = nicknameDraft.trim();
    if (!trimmed || trimmed === plant.nickname) {
      setIsEditingNickname(false);
      return;
    }
    setSavingNickname(true);
    try {
      const res = await fetch(`/api/student-plants/${plant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? "별명 저장 실패");
        return;
      }
      const j = await res.json();
      if (j?.studentPlant) onPlantUpdated(j.studentPlant as StudentPlantDTO);
      setIsEditingNickname(false);
    } finally {
      setSavingNickname(false);
    }
  }

  function cancelNicknameEdit() {
    setIsEditingNickname(false);
    setNicknameDraft("");
  }

  /** ⑧ 이미지 로딩 실패 fallback */
  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    const target = e.currentTarget;
    target.style.display = "none";
    const fallback = target.parentElement?.querySelector?.(".plant-img-fallback") as HTMLElement | null;
    if (fallback) fallback.style.display = "flex";
  }

  /** ⑨ 성장 비교 슬라이더 */
  function handleCompareMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const wrap = compareRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
      setComparePos((x / rect.width) * 100);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const composerOpen = editorStageId !== null;
  const editorStage: StageDTO | null =
    editorStageId ? stages.find((s) => s.id === editorStageId) ?? null : null;

  return (
    <div className="plant-roadmap">
      {/* ① 축하 배너 */}
      {celebrate && (
        <div className="plant-celebration-banner" role="status">
          🎉 {currentStage.order}단계 · {currentStage.nameKo} 도달!
        </div>
      )}

      <section className="plant-student-hero" aria-label="식물 관찰 로드맵 요약">
        <div className="plant-hero-main-card">
          <div className="plant-hero-eyebrow">관찰 로드맵</div>
          <div className="plant-hero-title-row">
            <span className="plant-head-emoji" aria-hidden>{plant.species.emoji}</span>
            <div>
              <div className="plant-head-name">{plant.species.nameKo}</div>
              {/* ③ 클릭투에디트 별명 */}
              {isEditingNickname ? (
                <div className="plant-head-nickname-edit">
                  <input
                    ref={nicknameInputRef}
                    type="text"
                    maxLength={20}
                    value={nicknameDraft}
                    onChange={(e) => setNicknameDraft(e.target.value)}
                    onBlur={saveNickname}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNickname();
                      if (e.key === "Escape") cancelNicknameEdit();
                    }}
                    aria-label="별명 편집"
                    disabled={savingNickname}
                  />
                </div>
              ) : (
                <div
                  className={`plant-head-nickname${canEdit ? " plant-head-nickname-click" : ""}`}
                  onClick={startNicknameEdit}
                  role={canEdit ? "button" : undefined}
                  tabIndex={canEdit ? 0 : undefined}
                  aria-label={canEdit ? "별명 편집하려면 클릭" : undefined}
                  onKeyDown={(e) => {
                    if (canEdit && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      startNicknameEdit();
                    }
                  }}
                >
                  “{plant.nickname}”
                </div>
              )}
            </div>
          </div>
          <div className="plant-hero-progress" aria-label={`성장 진행률 ${progressPercent}%`}>
            <div className="plant-hero-progress-head">
              <span>{currentStage.order}단계 · {currentStage.nameKo}</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="plant-hero-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="plant-hero-stat-row" aria-label="관찰 통계">
            <span><strong>{plant.observations.length}</strong>개 기록</span>
            <span><strong>{totalPhotos}</strong>장 사진</span>
            <span><strong>{lastObservedLabel}</strong></span>
          </div>
        </div>

        <div className="plant-hero-mission-card">
          <div className="plant-hero-eyebrow">이번 주 미션</div>
          <h2>{currentStage.icon} {currentStage.nameKo} 관찰하기</h2>
          <ul>
            {(missionPoints.length > 0 ? missionPoints : ["잎, 줄기, 색깔 중 달라진 점 찾기", "사진 1장 이상 남기기", "한 문장으로 변화 기록하기"]).map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {canEdit && (
            <button
              type="button"
              className="plant-hero-primary-cta"
              onClick={() => {
                setEditingObs(null);
                setEditorStageId(currentStage.id);
              }}
            >
              📷 사진으로 관찰 시작
            </button>
          )}
        </div>

        <aside className="plant-hero-camera-card" aria-label="사진 기록 요약">
          <span className="plant-camera-icon" aria-hidden>📸</span>
          <div>
            <strong>현재 단계 사진 {photosOnCurrentStage}장</strong>
            <p>{currentStageObservations.length > 0 ? "전후 비교할 기록이 쌓이고 있어요." : "첫 사진을 올리면 성장 비교가 쉬워져요."}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditingObs(null);
                setEditorStageId(currentStage.id);
              }}
            >
              바로 올리기
            </button>
          )}
        </aside>
      </section>

      <div className="plant-timeline" ref={timelineRef} role="list" aria-label="성장 타임라인">
        {stages.map((s, idx) => {
          const state = stageState(s.order);
          const obs = observationsByStage.get(s.id) ?? [];
          const isCurrent = s.id === currentStage.id;
          const isLast = idx === stages.length - 1;
          const isFirst = idx === 0;
          const canComposeHere =
            canEdit && (editAnyStage || isCurrent);

          /** ⑨ 비교 슬라이더: 같은 단계 내 2개 이상 이미지 */
          const allImages = obs.flatMap((o) => o.images);
          const hasComparable = allImages.length >= 2;
          const isComparing = compareStageId === s.id;

          return (
            <section
              key={s.id}
              className="plant-stage-row"
              data-state={state}
              role="listitem"
            >
              <aside className="plant-stage-rail" aria-hidden="true">
                <span
                  className="plant-stage-connector plant-stage-connector--top"
                  data-hidden={isFirst ? "true" : "false"}
                  data-state={state}
                />
                <span className="plant-stage-node" data-state={state}>
                  {s.order}
                </span>
                <span
                  className="plant-stage-connector plant-stage-connector--bottom"
                  data-hidden={isLast ? "true" : "false"}
                  data-state={state === "visited" ? "visited" : "upcoming"}
                />
              </aside>

              <div
                className="plant-stage-body"
                role="region"
                aria-label={`${s.order}단계: ${s.nameKo} (${
                  state === "active" ? "현재" : state === "visited" ? "완료" : "예정"
                })`}
              >
                <header className="plant-stage-body-head">
                  <h3>
                    <span aria-hidden className="plant-stage-body-icon">{s.icon}</span>
                    {s.order}단계 · {s.nameKo}
                    {isCurrent && <span className="plant-stage-body-pill">현재</span>}
                    {/* ① 축하 배지: 방금 전에 이 단계로 왔으면 */}
                    {justAdvanced.current && isCurrent && (
                      <span className="plant-milestone-badge">✨ 도착!</span>
                    )}
                  </h3>
                  {s.description && <p>{s.description}</p>}
                </header>

                {/* ② 미관찰 리마인더 (현재 단계만) */}
                {isCurrent && daysSinceLastObs !== null && (
                  <div
                    className="plant-stall-indicator"
                    data-level={
                      daysSinceLastObs === 0
                        ? "ok"
                        : daysSinceLastObs < STALL_THRESHOLD_DAYS
                          ? "warn"
                          : "danger"
                    }
                  >
                    {daysSinceLastObs === 0
                      ? "🟢 오늘 관찰했어요!"
                      : daysSinceLastObs < STALL_THRESHOLD_DAYS
                        ? `⏰ ${daysSinceLastObs}일째 미관찰`
                        : `⚠️ ${daysSinceLastObs}일째 미관찰 — 정체 위험!`}
                  </div>
                )}
                {isCurrent && daysSinceLastObs === null && obs.length === 0 && (
                  <div className="plant-stall-indicator" data-level="warn">
                    🌱 아직 첫 관찰을 기록해보세요!
                  </div>
                )}

                {s.observationPoints.length > 0 && (
                  <div className="plant-stage-body-points">
                    <h4>관찰 포인트</h4>
                    <ul>
                      {s.observationPoints.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="plant-stage-body-obs">
                  {obs.length === 0 ? (
                    <p className="plant-stage-body-empty">
                      {state === "upcoming" ? "아직 도달 전" : "아직 기록이 없어요."}
                    </p>
                  ) : (
                    <div className="plant-stage-body-obs-grid">
                      {obs.map((o) => (
                        <article key={o.id} className="plant-obs-card">
                          <div className="plant-obs-meta">
                            <span>{new Date(o.observedAt).toLocaleString("ko-KR")}</span>
                            <span>{o.images.length}장</span>
                          </div>
                          {o.images.length > 0 && (
                            <div className="plant-obs-imgs">
                              {o.images.map((img) => (
                                <div
                                  key={img.id}
                                  className="plant-obs-img optimized-img-wrap"
                                  onClick={() => setLightbox(img.url)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setLightbox(img.url);
                                    }
                                  }}
                                >
                                  <OptimizedImage
                                    src={img.thumbnailUrl ?? img.url}
                                    alt="관찰 사진"
                                    sizes="(max-width: 768px) 33vw, 160px"
                                    onError={handleImgError}
                                  />
                                  {/* ⑧ 이미지 fallback */}
                                  <div className="plant-img-fallback" style={{ display: "none" }}>
                                    🌱
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {o.memo && <p className="plant-obs-memo">{o.memo}</p>}
                          {o.noPhotoReason && (
                            <p className="plant-obs-reason">사진 없음: {o.noPhotoReason}</p>
                          )}
                          {canEdit && (
                            <div className="plant-obs-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingObs(o);
                                  setEditorStageId(s.id);
                                }}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteObservation(o)}
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {/* ⑨ 성장 비교 슬라이더 */}
                {hasComparable && state !== "upcoming" && (
                  <>
                    {isComparing ? (
                      <div
                        className="plant-compare-wrap"
                        ref={compareRef}
                        onMouseDown={handleCompareMouseDown}
                        onTouchMove={(e) => {
                          const rect = compareRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const touch = e.touches[0];
                          const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
                          setComparePos((x / rect.width) * 100);
                        }}
                      >
                        <img
                          className="plant-compare-img"
                          src={allImages[0].thumbnailUrl ?? allImages[0].url}
                          alt="이전 사진"
                        />
                        <div className="plant-compare-overlay" style={{ width: `${comparePos}%` }}>
                          <img
                            src={allImages[allImages.length - 1].thumbnailUrl ?? allImages[allImages.length - 1].url}
                            alt="최신 사진"
                          />
                        </div>
                        <div className="plant-compare-handle" style={{ left: `${comparePos}%` }} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="plant-compare-toggle"
                        onClick={() => setCompareStageId(s.id)}
                      >
                        📸 이전 사진과 비교
                      </button>
                    )}
                    {isComparing && (
                      <button
                        type="button"
                        className="plant-compare-toggle"
                        onClick={() => setCompareStageId(null)}
                        style={{ marginLeft: 6 }}
                      >
                        비교 닫기
                      </button>
                    )}
                  </>
                )}

                {canComposeHere && (
                  <div className="plant-stage-body-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        setEditingObs(null);
                        setEditorStageId(s.id);
                      }}
                    >
                      관찰 추가
                    </button>
                    {isCurrent && canEdit && (
                      <button
                        type="button"
                        onClick={handleAdvanceRequest}
                        disabled={busyAdvance}
                        title={
                          photosOnCurrentStage > 0
                            ? "다음 단계로"
                            : "사진이 없어요 — 사유를 적게 됩니다"
                        }
                      >
                        다음 단계로 →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <ObservationEditor
        open={composerOpen}
        title={
          editingObs
            ? "관찰 기록 수정"
            : editorStage
            ? `${editorStage.order}단계 · ${editorStage.nameKo} 기록 추가`
            : "관찰 기록 추가"
        }
        initial={editingObs}
        onCancel={() => {
          setEditorStageId(null);
          setEditingObs(null);
        }}
        onSubmit={async (payload) => {
          if (editingObs) {
            await handlePatchObservation(editingObs.id, payload);
          } else {
            await handleCreateObservation(payload);
          }
        }}
      />

      <NoPhotoReasonModal
        open={reasonOpen}
        onCancel={() => setReasonOpen(false)}
        onSubmit={handleReasonSubmit}
        busy={busyAdvance}
        error={reasonError}
      />

      {lightbox && (
        <div
          className="plant-lightbox"
          role="dialog"
          aria-label="사진 원본"
          onClick={() => setLightbox(null)}
        >
          <div className="plant-lightbox-frame optimized-img-wrap">
            <OptimizedImage
              src={lightbox}
              alt="관찰 사진 원본"
              sizes="90vw"
              priority
              fit="contain"
              onError={handleImgError}
            />
            {/* ⑧ 라이트박스 fallback */}
            <div className="plant-img-fallback" style={{ display: "none", position: "absolute", inset: 0, fontSize: 64 }}>
              🌱
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
