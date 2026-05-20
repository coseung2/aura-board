"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from "react";
import type { ObservationDTO, StageDTO, StudentPlantDTO } from "@/types/plant";
import { STALL_THRESHOLD_DAYS } from "@/lib/plant-schemas";
import { ObservationEditor } from "./ObservationEditor";
import { NoPhotoReasonModal } from "./NoPhotoReasonModal";
import { OptimizedImage } from "../ui/OptimizedImage";

interface Props {
  plant: StudentPlantDTO;
  canEdit: boolean;
  /**
   * Teacher drill-down mode can add observations to any stage. Student mode
   * only composes on the current stage.
   */
  editAnyStage?: boolean;
  onPlantUpdated: (next: StudentPlantDTO) => void;
}

type ObservationPayload = { memo: string; images: { url: string }[] };
type StageState = "visited" | "active" | "upcoming";

function usePlantMutations(plantId: string, onPlantUpdated: (next: StudentPlantDTO) => void) {
  const refreshPlant = useCallback(async () => {
    const res = await fetch(`/api/student-plants/${plantId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data?.studentPlant) {
      onPlantUpdated(data.studentPlant as StudentPlantDTO);
    }
  }, [onPlantUpdated, plantId]);

  const createObservation = useCallback(
    async (stageId: string, payload: ObservationPayload) => {
      const res = await fetch(`/api/student-plants/${plantId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId, memo: payload.memo, images: payload.images }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "관찰 기록을 저장하지 못했어요.");
      }
      await refreshPlant();
    },
    [plantId, refreshPlant],
  );

  const updateObservation = useCallback(
    async (obsId: string, payload: ObservationPayload) => {
      const res = await fetch(`/api/student-plants/${plantId}/observations/${obsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "관찰 기록을 수정하지 못했어요.");
      }
      await refreshPlant();
    },
    [plantId, refreshPlant],
  );

  const deleteObservation = useCallback(
    async (obsId: string) => {
      const res = await fetch(`/api/student-plants/${plantId}/observations/${obsId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "관찰 기록을 삭제하지 못했어요.");
      }
      await refreshPlant();
    },
    [plantId, refreshPlant],
  );

  const updateNickname = useCallback(
    async (nickname: string) => {
      const res = await fetch(`/api/student-plants/${plantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "별명을 저장하지 못했어요.");
      }
      const data = await res.json();
      if (data?.studentPlant) {
        onPlantUpdated(data.studentPlant as StudentPlantDTO);
      }
    },
    [onPlantUpdated, plantId],
  );

  const advanceStage = useCallback(
    async (noPhotoReason?: string) => {
      const res = await fetch(`/api/student-plants/${plantId}/advance-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noPhotoReason ? { noPhotoReason } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "require_reason") {
          return { needsReason: true, message: data?.message as string | undefined };
        }
        throw new Error(data?.message ?? data?.error ?? "다음 단계로 이동하지 못했어요.");
      }
      await refreshPlant();
      return { needsReason: false };
    },
    [plantId, refreshPlant],
  );

  return { createObservation, updateObservation, deleteObservation, updateNickname, advanceStage };
}

function groupObservationsByStage(observations: ObservationDTO[]) {
  const map = new Map<string, ObservationDTO[]>();
  for (const observation of observations) {
    const list = map.get(observation.stageId) ?? [];
    list.push(observation);
    map.set(observation.stageId, list);
  }
  return map;
}

function formatLastObserved(daysSinceLastObs: number | null) {
  if (daysSinceLastObs === null) return "첫 관찰 대기";
  if (daysSinceLastObs === 0) return "오늘 관찰 완료";
  return `${daysSinceLastObs}일 전 관찰`;
}

function imageErrorFallback(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget;
  target.style.display = "none";
  const fallback = target.parentElement?.querySelector?.(".plant-img-fallback") as HTMLElement | null;
  if (fallback) fallback.style.display = "flex";
}

function PlantNickname({
  nickname,
  canEdit,
  onSave,
}: {
  nickname: string;
  canEdit: boolean;
  onSave: (nickname: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function startEdit() {
    if (!canEdit) return;
    setDraft(nickname);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function save() {
    const next = draft.trim();
    if (!next || next === nickname) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "별명을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="plant-head-nickname-edit">
        <input
          ref={inputRef}
          type="text"
          maxLength={20}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") {
              setEditing(false);
              setDraft("");
            }
          }}
          aria-label="식물 별명 편집"
          disabled={saving}
        />
      </div>
    );
  }

  return (
    <div
      className={`plant-head-nickname${canEdit ? " plant-head-nickname-click" : ""}`}
      onClick={startEdit}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? "식물 별명 편집" : undefined}
      onKeyDown={(event) => {
        if (canEdit && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          startEdit();
        }
      }}
    >
      {nickname}
    </div>
  );
}

function StageCompare({
  images,
  open,
  onOpen,
  onClose,
}: {
  images: ObservationDTO["images"];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState(50);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const first = images[0];
  const latest = images[images.length - 1];

  function updatePosition(clientX: number) {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    updatePosition(event.clientX);
    const onMove = (moveEvent: globalThis.MouseEvent) => updatePosition(moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (!open) {
    return (
      <button type="button" className="plant-compare-toggle" onClick={onOpen}>
        이전 사진과 비교
      </button>
    );
  }

  return (
    <>
      <div
        className="plant-compare-wrap"
        ref={compareRef}
        onMouseDown={handleMouseDown}
        onTouchMove={(event) => updatePosition(event.touches[0].clientX)}
      >
        <img className="plant-compare-img" src={first.thumbnailUrl ?? first.url} alt="이전 관찰 사진" />
        <div className="plant-compare-overlay" style={{ width: `${position}%` }}>
          <img src={latest.thumbnailUrl ?? latest.url} alt="최근 관찰 사진" />
        </div>
        <div className="plant-compare-handle" style={{ left: `${position}%` }} />
      </div>
      <button type="button" className="plant-compare-toggle" onClick={onClose} style={{ marginLeft: 6 }}>
        비교 닫기
      </button>
    </>
  );
}

function ObservationCard({
  observation,
  canEdit,
  onEdit,
  onDelete,
  onOpenImage,
}: {
  observation: ObservationDTO;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <article className="plant-obs-card">
      <div className="plant-obs-meta">
        <span>{new Date(observation.observedAt).toLocaleString("ko-KR")}</span>
        <span>{observation.images.length}장</span>
      </div>
      {observation.images.length > 0 && (
        <div className="plant-obs-imgs">
          {observation.images.map((image) => (
            <div
              key={image.id}
              className="plant-obs-img optimized-img-wrap"
              onClick={() => onOpenImage(image.url)}
              role="button"
              tabIndex={0}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenImage(image.url);
                }
              }}
            >
              <OptimizedImage
                src={image.thumbnailUrl ?? image.url}
                alt="관찰 사진"
                sizes="(max-width: 768px) 33vw, 160px"
                onError={imageErrorFallback}
              />
              <div className="plant-img-fallback" style={{ display: "none" }}>
                사진
              </div>
            </div>
          ))}
        </div>
      )}
      {observation.memo && <p className="plant-obs-memo">{observation.memo}</p>}
      {observation.noPhotoReason && (
        <p className="plant-obs-reason">사진 없음: {observation.noPhotoReason}</p>
      )}
      {canEdit && (
        <div className="plant-obs-actions">
          <button type="button" onClick={onEdit}>
            수정
          </button>
          <button type="button" onClick={onDelete}>
            삭제
          </button>
        </div>
      )}
    </article>
  );
}

function StageRow({
  stage,
  state,
  isFirst,
  isLast,
  isCurrent,
  observations,
  canCompose,
  canEdit,
  stalledDays,
  busyAdvance,
  onAddObservation,
  onEditObservation,
  onDeleteObservation,
  onAdvance,
  onOpenImage,
  comparing,
  onCompareOpen,
  onCompareClose,
}: {
  stage: StageDTO;
  state: StageState;
  isFirst: boolean;
  isLast: boolean;
  isCurrent: boolean;
  observations: ObservationDTO[];
  canCompose: boolean;
  canEdit: boolean;
  stalledDays: number | null;
  busyAdvance: boolean;
  onAddObservation: () => void;
  onEditObservation: (observation: ObservationDTO) => void;
  onDeleteObservation: (observation: ObservationDTO) => void;
  onAdvance: () => void;
  onOpenImage: (url: string) => void;
  comparing: boolean;
  onCompareOpen: () => void;
  onCompareClose: () => void;
}) {
  const images = observations.flatMap((observation) => observation.images);
  const hasComparableImages = images.length >= 2;

  return (
    <section className="plant-stage-row" data-state={state} role="listitem">
      <aside className="plant-stage-rail" aria-hidden="true">
        <span
          className="plant-stage-connector plant-stage-connector--top"
          data-hidden={isFirst ? "true" : "false"}
          data-state={state}
        />
        <span className="plant-stage-node" data-state={state}>
          {stage.order}
        </span>
        <span
          className="plant-stage-connector plant-stage-connector--bottom"
          data-hidden={isLast ? "true" : "false"}
          data-state={state === "visited" ? "visited" : "upcoming"}
        />
      </aside>

      <div className="plant-stage-body" role="region" aria-label={`${stage.order}단계: ${stage.nameKo}`}>
        <header className="plant-stage-body-head">
          <h3>
            <span aria-hidden className="plant-stage-body-icon">
              {stage.icon}
            </span>
            {stage.order}단계 · {stage.nameKo}
            {isCurrent && <span className="plant-stage-body-pill">현재</span>}
          </h3>
          {stage.description && <p>{stage.description}</p>}
        </header>

        {isCurrent && (
          <StallIndicator daysSinceLastObs={stalledDays} hasObservations={observations.length > 0} />
        )}

        {stage.observationPoints.length > 0 && (
          <div className="plant-stage-body-points">
            <h4>관찰 포인트</h4>
            <ul>
              {stage.observationPoints.map((point, index) => (
                <li key={`${stage.id}-${index}`}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="plant-stage-body-obs">
          {observations.length === 0 ? (
            <p className="plant-stage-body-empty">
              {state === "upcoming" ? "아직 도달 전" : "아직 기록이 없어요."}
            </p>
          ) : (
            <div className="plant-stage-body-obs-grid">
              {observations.map((observation) => (
                <ObservationCard
                  key={observation.id}
                  observation={observation}
                  canEdit={canEdit}
                  onEdit={() => onEditObservation(observation)}
                  onDelete={() => onDeleteObservation(observation)}
                  onOpenImage={onOpenImage}
                />
              ))}
            </div>
          )}
        </div>

        {hasComparableImages && state !== "upcoming" && (
          <StageCompare images={images} open={comparing} onOpen={onCompareOpen} onClose={onCompareClose} />
        )}

        {canCompose && (
          <div className="plant-stage-body-actions">
            <button type="button" className="primary" onClick={onAddObservation}>
              관찰 추가
            </button>
            {isCurrent && (
              <button type="button" onClick={onAdvance} disabled={busyAdvance}>
                다음 단계로
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function StallIndicator({
  daysSinceLastObs,
  hasObservations,
}: {
  daysSinceLastObs: number | null;
  hasObservations: boolean;
}) {
  if (daysSinceLastObs === null && !hasObservations) {
    return (
      <div className="plant-stall-indicator" data-level="warn">
        아직 첫 관찰이 없어요. 오늘 사진이나 메모를 남겨보세요.
      </div>
    );
  }

  if (daysSinceLastObs === null) return null;

  const level =
    daysSinceLastObs === 0
      ? "ok"
      : daysSinceLastObs < STALL_THRESHOLD_DAYS
        ? "warn"
        : "danger";
  const text =
    daysSinceLastObs === 0
      ? "오늘 관찰했어요."
      : daysSinceLastObs < STALL_THRESHOLD_DAYS
        ? `${daysSinceLastObs}일째 관찰이 없어요.`
        : `${daysSinceLastObs}일째 관찰이 멈췄어요.`;

  return (
    <div className="plant-stall-indicator" data-level={level}>
      {text}
    </div>
  );
}

export function RoadmapView({ plant, canEdit, editAnyStage = false, onPlantUpdated }: Props) {
  const [editorStageId, setEditorStageId] = useState<string | null>(null);
  const [editingObservation, setEditingObservation] = useState<ObservationDTO | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busyAdvance, setBusyAdvance] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [compareStageId, setCompareStageId] = useState<string | null>(null);

  const stages = plant.species.stages;
  const currentStage = stages.find((stage) => stage.id === plant.currentStageId) ?? stages[0];
  const currentOrder = currentStage?.order ?? 0;
  const observationsByStage = useMemo(
    () => groupObservationsByStage(plant.observations),
    [plant.observations],
  );
  const totalPhotos = plant.observations.reduce(
    (total, observation) => total + observation.images.length,
    0,
  );
  const progressPercent = stages.length ? Math.round((currentOrder / stages.length) * 100) : 0;
  const missionPoints = currentStage?.observationPoints.slice(0, 3) ?? [];
  const daysSinceLastObs = useMemo(() => {
    if (plant.observations.length === 0) return null;
    const latestMs = Math.max(...plant.observations.map((observation) => new Date(observation.observedAt).getTime()));
    return Math.floor((Date.now() - latestMs) / (24 * 60 * 60 * 1000));
  }, [plant.observations]);
  const editorStage: StageDTO | null = editorStageId
    ? stages.find((stage) => stage.id === editorStageId) ?? null
    : null;

  const mutations = usePlantMutations(plant.id, onPlantUpdated);

  function stageState(order: number): StageState {
    if (order < currentOrder) return "visited";
    if (order === currentOrder) return "active";
    return "upcoming";
  }

  function openObservationEditor(stageId: string, observation: ObservationDTO | null = null) {
    setEditingObservation(observation);
    setEditorStageId(stageId);
  }

  async function handleDeleteObservation(observation: ObservationDTO) {
    if (!confirm("이 관찰 기록을 삭제할까요?")) return;
    try {
      await mutations.deleteObservation(observation.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "관찰 기록을 삭제하지 못했어요.");
    }
  }

  async function handleAdvance(reason?: string) {
    setBusyAdvance(true);
    setReasonError(null);
    try {
      const result = await mutations.advanceStage(reason);
      if (result.needsReason) {
        setReasonOpen(true);
        return;
      }
      setReasonOpen(false);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 3000);
      setTimeout(() => {
        document.querySelector('[data-state="active"]')?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    } catch (error) {
      const message = error instanceof Error ? error.message : "다음 단계로 이동하지 못했어요.";
      if (reason) setReasonError(message);
      else alert(message);
    } finally {
      setBusyAdvance(false);
    }
  }

  return (
    <div className="plant-roadmap">
      {celebrate && (
        <div className="plant-celebration-banner" role="status">
          {currentStage.order}단계 · {currentStage.nameKo}에 도착했어요!
        </div>
      )}

      <section className="plant-student-hero" aria-label="식물 관찰 로드맵 요약">
        <div className="plant-hero-main-card">
          <div className="plant-hero-eyebrow">관찰 로드맵</div>
          <div className="plant-hero-title-row">
            <span className="plant-head-emoji" aria-hidden>
              {plant.species.emoji}
            </span>
            <div>
              <div className="plant-head-name">{plant.species.nameKo}</div>
              <PlantNickname nickname={plant.nickname} canEdit={canEdit} onSave={mutations.updateNickname} />
            </div>
          </div>
          <div className="plant-hero-progress" aria-label={`성장 진행률 ${progressPercent}%`}>
            <div className="plant-hero-progress-head">
              <span>
                {currentStage.order}단계 · {currentStage.nameKo}
              </span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="plant-hero-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="plant-hero-stat-row" aria-label="관찰 통계">
            <span>
              <strong>{plant.observations.length}</strong>개 기록
            </span>
            <span>
              <strong>{totalPhotos}</strong>장 사진
            </span>
            <span>
              <strong>{formatLastObserved(daysSinceLastObs)}</strong>
            </span>
          </div>
        </div>

        <div className="plant-hero-mission-card">
          <div className="plant-hero-eyebrow">이번 주 미션</div>
          <h2>
            {currentStage.icon} {currentStage.nameKo} 관찰하기
          </h2>
          <ul>
            {(missionPoints.length > 0
              ? missionPoints
              : ["줄기, 잎, 색깔 중 달라진 점 찾기", "사진 1장 이상 올리기", "한 문장으로 변화 기록하기"]
            ).map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {canEdit && (
            <button type="button" className="ds-btn-primary" onClick={() => openObservationEditor(currentStage.id)}>
              사진으로 관찰 시작
            </button>
          )}
        </div>
      </section>

      <div className="plant-timeline" role="list" aria-label="성장 단계 타임라인">
        {stages.map((stage, index) => {
          const state = stageState(stage.order);
          const observations = observationsByStage.get(stage.id) ?? [];
          const isCurrent = stage.id === currentStage.id;
          return (
            <StageRow
              key={stage.id}
              stage={stage}
              state={state}
              isFirst={index === 0}
              isLast={index === stages.length - 1}
              isCurrent={isCurrent}
              observations={observations}
              canCompose={canEdit && (editAnyStage || isCurrent)}
              canEdit={canEdit}
              stalledDays={daysSinceLastObs}
              busyAdvance={busyAdvance}
              onAddObservation={() => openObservationEditor(stage.id)}
              onEditObservation={(observation) => openObservationEditor(stage.id, observation)}
              onDeleteObservation={handleDeleteObservation}
              onAdvance={() => void handleAdvance()}
              onOpenImage={setLightbox}
              comparing={compareStageId === stage.id}
              onCompareOpen={() => setCompareStageId(stage.id)}
              onCompareClose={() => setCompareStageId(null)}
            />
          );
        })}
      </div>

      <ObservationEditor
        open={editorStageId !== null}
        title={
          editingObservation
            ? "관찰 기록 수정"
            : editorStage
              ? `${editorStage.order}단계 · ${editorStage.nameKo} 기록 추가`
              : "관찰 기록 추가"
        }
        initial={editingObservation}
        onCancel={() => {
          setEditorStageId(null);
          setEditingObservation(null);
        }}
        onSubmit={async (payload) => {
          if (!editorStageId) return;
          if (editingObservation) {
            await mutations.updateObservation(editingObservation.id, payload);
          } else {
            await mutations.createObservation(editorStageId, payload);
          }
          setEditorStageId(null);
          setEditingObservation(null);
        }}
      />

      <NoPhotoReasonModal
        open={reasonOpen}
        onCancel={() => setReasonOpen(false)}
        onSubmit={(reason) => handleAdvance(reason)}
        busy={busyAdvance}
        error={reasonError}
      />

      {lightbox && (
        <div className="plant-lightbox" role="dialog" aria-label="사진 원본" onClick={() => setLightbox(null)}>
          <div className="plant-lightbox-frame optimized-img-wrap">
            <OptimizedImage
              src={lightbox}
              alt="관찰 사진 원본"
              sizes="90vw"
              priority
              fit="contain"
              onError={imageErrorFallback}
            />
            <div className="plant-img-fallback" style={{ display: "none", position: "absolute", inset: 0, fontSize: 64 }}>
              사진을 불러오지 못했어요.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
