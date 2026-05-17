"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SpeciesDTO, TeacherSummaryDTO, RecentObservationDTO } from "@/types/plant";
import { PlantAllowListModal } from "./PlantAllowListModal";

interface Props {
  summary: TeacherSummaryDTO;
  recentObservations: RecentObservationDTO[];
  allSpecies: SpeciesDTO[]; // full catalog, not just allowed
  allowedSpecies: SpeciesDTO[]; // classroom allow-list
  classroomId: string;
  /** Board id, used to build drill-down links /board/{boardId}/student/{studentId} (v2). */
  boardId: string;
  boardTitle: string;
  onAllowListSaved: () => void;
}

type StudentFilter = "all" | "stalled" | "completed";

function formatAgo(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

function recencyIndicator(iso: string | null) {
  if (!iso) return { mark: "⚪", label: "관찰 없음" };
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return { mark: "🟢", label: "오늘" };
  if (days <= 3) return { mark: "🟡", label: "3일 이내" };
  return { mark: "🔴", label: "7일+" };
}

export function TeacherSummaryView({
  summary,
  recentObservations,
  allSpecies,
  allowedSpecies,
  classroomId,
  boardId,
  boardTitle,
  onAllowListSaved,
}: Props) {
  const [showAllow, setShowAllow] = useState(false);
  const [studentFilter, setStudentFilter] = useState<StudentFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  const stages = Array.from({ length: 10 }, (_, i) => i + 1);

  const studentHref = (studentId: string) =>
    `/board/${boardId}/student/${studentId}`;

  const stalledStudents = useMemo(
    () => summary.students.filter((s) => s.stalled),
    [summary.students]
  );
  const notStartedCount = summary.totalStudents - summary.plantedCount;
  const healthyCount = summary.students.filter((s) => s.currentStageOrder && !s.stalled).length;
  const plantedPercent = summary.totalStudents > 0
    ? Math.round((summary.plantedCount / summary.totalStudents) * 100)
    : 0;
  const avgStage = summary.plantedCount > 0
    ? (
        summary.students.reduce((acc, s) => acc + (s.currentStageOrder ?? 0), 0) /
        summary.plantedCount
      ).toFixed(1)
    : "0";
  const maxDistribution = Math.max(1, ...stages.map((s) => summary.distribution[String(s)] ?? 0));

  const filteredStudents = summary.students.filter((s) => {
    if (studentFilter === "stalled" && !s.stalled) return false;
    if (studentFilter === "completed" && s.stalled) return false;
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return [s.name, s.nickname, s.speciesName, s.currentStageName, String(s.number ?? "")]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q));
  });

  const stageData = stages.map((s) => ({
    order: s,
    count: summary.distribution[String(s)] ?? 0,
  }));
  const maxDistCount = Math.max(1, ...stageData.map((d) => d.count));

  /** Matrix preview data: first N students for the mini grid */
  const matrixPreviewStudents = filteredStudents.slice(0, 6);
  const previewStages = stages.slice(0, 5);

  return (
    <div className="plant-teacher">
      <nav className="plant-breadcrumb" aria-label="breadcrumb">
        <Link href={`/board/${boardId}`}>{boardTitle}</Link>
        <span className="plant-breadcrumb-sep">&gt;</span>
        <span>식물관찰일지</span>
      </nav>

      {/* ── Gamified Hero ── */}
      <section className="plant-hero-game" aria-label="교사용 미션 컨트롤">
        <div>
          <h1>🌱 식물 관찰일지</h1>
          <p>오늘 챙겨야 할 학생, 단계 분포, 전체 매트릭스를 한 화면에서 확인해요</p>
        </div>
        <div className="plant-hero-game-actions">
          <button type="button" onClick={() => setShowAllow(true)} className="ds-btn-secondary">
            🌿 식물 허용 목록
          </button>
          <Link
            href={`/classroom/${classroomId}/plant-matrix`}
            className="ds-btn-primary"
          >
            📊 매트릭스 전체 보기
          </Link>
        </div>
      </section>

      {/* ── Game KPI Cards ── */}
      <section className="plant-kpi-game-grid" aria-label="학급 관찰 요약">
        <article className="plant-kpi-game-card kpi-tone-green">
          <div className="kpi-icon">🌱</div>
          <div className="kpi-label">식물 선택</div>
          <div className="kpi-value">{summary.plantedCount}/{summary.totalStudents}</div>
          <div className="kpi-sub">{plantedPercent}% 참여 중</div>
          <div className="kpi-micro"><div className="kpi-micro-fill" style={{ width: `${plantedPercent}%` }} /></div>
        </article>
        <article className="plant-kpi-game-card kpi-tone-red">
          <div className="kpi-icon">⏳</div>
          <div className="kpi-label">정체 학생</div>
          <div className="kpi-value">{stalledStudents.length}</div>
          <div className="kpi-sub">7일 이상 관찰 없음</div>
          <div className="kpi-micro"><div className="kpi-micro-fill" style={{ width: `${summary.plantedCount > 0 ? (stalledStudents.length / summary.plantedCount) * 100 : 0}%` }} /></div>
        </article>
        <article className="plant-kpi-game-card kpi-tone-amber">
          <div className="kpi-icon">🫘</div>
          <div className="kpi-label">미선택</div>
          <div className="kpi-value">{notStartedCount}</div>
          <div className="kpi-sub">첫 식물 선택 필요</div>
          <div className="kpi-micro"><div className="kpi-micro-fill" style={{ width: `${summary.totalStudents > 0 ? (notStartedCount / summary.totalStudents) * 100 : 0}%` }} /></div>
        </article>
        <article className="plant-kpi-game-card kpi-tone-blue">
          <div className="kpi-icon">📈</div>
          <div className="kpi-label">평균 단계</div>
          <div className="kpi-value">{avgStage}</div>
          <div className="kpi-sub">정상 진행 {healthyCount}명</div>
          <div className="kpi-micro"><div className="kpi-micro-fill" style={{ width: `${(parseFloat(avgStage) / 10) * 100}%` }} /></div>
        </article>
      </section>

      {/* ── Dashboard: Observations + Alerts ── */}
      <div className="plant-dash-game">
        {/* Left: Recent Observations */}
        <div className="plant-panel-game">
          <div className="plant-panel-game-head">
            <div>
              <span className="plant-panel-game-eyebrow">Recent observations</span>
              <h3 style={{ marginTop: 2, fontSize: 16, fontWeight: 700 }}>
                최근 관찰 기록 ({recentObservations.length}건)
              </h3>
            </div>
            {recentObservations.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                최근 {recentObservations.length}개의 관찰
              </span>
            )}
          </div>
          {recentObservations.length > 0 ? (
            <div className="plant-obs-feed">
              {recentObservations.map((obs) => (
                <button
                  key={obs.id}
                  type="button"
                  className="plant-obs-feed-card"
                  onClick={() => router.push(studentHref(obs.student.id))}
                  aria-label={`${obs.student.name}의 관찰 기록 열기`}
                >
                  {obs.thumbnail ? (
                    <img
                      src={obs.thumbnail}
                      alt=""
                      className="plant-obs-feed-thumb"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="plant-obs-feed-noimg">{obs.species.emoji}</div>
                  )}
                  <div className="plant-obs-feed-info">
                    <span className="plant-obs-feed-student">
                      {obs.student.number ?? "—"}번 {obs.student.name}
                    </span>
                    <span className="plant-obs-feed-plant">
                      {obs.species.emoji} {obs.species.nameKo} · &ldquo;{obs.plantNickname}&rdquo;
                    </span>
                    {obs.memo && (
                      <span className="plant-obs-feed-memo">{obs.memo}</span>
                    )}
                    <span className="plant-obs-feed-time">
                      {new Date(obs.observedAt).toLocaleString("ko-KR", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, margin: 0 }}>
              아직 관찰 기록이 없어요. 학생들이 첫 관찰을 시작하면 여기에 표시됩니다.
            </p>
          )}
        </div>

        {/* Right: Today's students */}
        <aside className="plant-panel-game" aria-label="정체 학생 빠른 확인">
          <div className="plant-panel-game-head">
            <div>
              <span className="plant-panel-game-eyebrow">Needs attention</span>
              <h3>오늘 챙길 학생</h3>
            </div>
            <button
              type="button"
              className="ds-btn-secondary"
              style={{ padding: "6px 14px", fontSize: 12 }}
              onClick={() => setStudentFilter("stalled")}
            >
              정체만 보기
            </button>
          </div>
          {stalledStudents.length > 0 ? (
            <div className="plant-alert-game">
              {stalledStudents.slice(0, 5).map((s) => (
                <button key={s.id} type="button" className="plant-alert-game-card" onClick={() => router.push(studentHref(s.id))}>
                  <span className="plant-alert-game-avatar">{s.speciesEmoji ?? "🌱"}</span>
                  <span className="plant-alert-game-info">
                    <span className="plant-alert-game-name">{s.name} · {s.number ?? "—"}번</span>
                    <span className="plant-alert-game-meta">{s.currentStageOrder ? `${s.currentStageOrder}단계 · ${formatAgo(s.lastObservedAt)}` : "식물 선택 확인"}</span>
                  </span>
                  <span className="plant-alert-game-badge">정체</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
              정체 학생이 없어요. 오늘 진행이 안정적이에요.
            </p>
          )}
          {notStartedCount > 0 && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
              외 {notStartedCount}명이 식물을 아직 선택하지 않았어요
            </p>
          )}
        </aside>
      </div>

      {/* ── Stage Distribution (full width bottom) ── */}
      <section className="plant-panel-game">
        <div className="plant-panel-game-head">
          <div>
            <span className="plant-panel-game-eyebrow">Stage distribution</span>
            <h3>단계별 분포표</h3>
          </div>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>가장 몰린 단계를 먼저 확인</span>
        </div>
        <div className="plant-dist-game">
          {stageData.map((d) => (
            <div className="plant-dist-game-wrap" key={d.order}>
              <span className="plant-dist-game-count">{d.count}</span>
              <div className="plant-dist-game-bar" style={{ height: `${Math.max(6, (d.count / maxDistCount) * 100)}%` }} />
              <span className="plant-dist-game-label">{d.order}단계</span>
            </div>
          ))}
        </div>
      </section>

      <PlantAllowListModal
        open={showAllow}
        allSpecies={allSpecies}
        initialAllowed={new Set(allowedSpecies.map((s) => s.id))}
        classroomId={classroomId}
        onClose={() => setShowAllow(false)}
        onSaved={() => {
          setShowAllow(false);
          onAllowListSaved();
        }}
      />
    </div>
  );
}
