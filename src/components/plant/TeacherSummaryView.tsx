"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SpeciesDTO, TeacherSummaryDTO } from "@/types/plant";
import { PlantAllowListModal } from "./PlantAllowListModal";

interface Props {
  summary: TeacherSummaryDTO;
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

      {/* ── Dashboard: Distribution + Alerts ── */}
      <div className="plant-dash-game">
        <div className="plant-panel-game">
          <div className="plant-panel-game-head">
            <div>
              <span className="plant-panel-game-eyebrow">Stage distribution</span>
              <h3>단계별 분포</h3>
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
        </div>

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

      {/* ── Student Card Grid ── */}
      <section className="plant-panel-game" style={{ marginBottom: 0 }}>
        <div className="plant-panel-game-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <span className="plant-panel-game-eyebrow">Student roster</span>
            <h3 style={{ marginTop: 2, fontSize: 16, fontWeight: 700 }}>학생별 진행 상태</h3>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="이름·식물·단계 검색"
              aria-label="학생 검색"
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: "8px 14px",
                fontSize: 13,
                width: 180,
                font: "inherit",
                background: "var(--color-surface)",
              }}
            />
            <select
              className="plant-filter-select"
              value={studentFilter}
              aria-label="학생 상태 필터"
              onChange={(e) => setStudentFilter(e.target.value as StudentFilter)}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                background: "white",
                font: "inherit",
              }}
            >
              <option value="all">전체</option>
              <option value="stalled">정체 학생만</option>
              <option value="completed">정상 진행</option>
            </select>
          </div>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="plant-student-game-grid">
            {filteredStudents.map((s) => {
              const recency = recencyIndicator(s.lastObservedAt);
              const stageDotClass =
                recency.mark === "🔴" ? "stage-red"
                : recency.mark === "🟡" ? "stage-yellow"
                : recency.mark === "🟢" ? "stage-green"
                : "stage-green";
              return (
                <button
                  key={s.id}
                  type="button"
                  className="plant-student-game-card"
                  onClick={() => router.push(studentHref(s.id))}
                  aria-label={`${s.name} 관찰일지 열기`}
                >
                  <span className="plant-student-game-avatar">{s.speciesEmoji ?? "🫘"}</span>
                  <span className="plant-student-game-info">
                    <span className="plant-student-game-name">
                      {s.name} · {s.number ?? "—"}번
                      {s.speciesName && (
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 4 }}>
                          {s.speciesEmoji} {s.speciesName}({s.nickname})
                        </span>
                      )}
                    </span>
                    <span className="plant-student-game-plant">
                      {s.currentStageOrder ? (
                        <span className="plant-student-game-stage">
                          <span className={`stage-dot ${stageDotClass}`} />
                          {s.currentStageOrder}단계 · {s.currentStageName} · {formatAgo(s.lastObservedAt)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)" }}>식물 선택 전</span>
                      )}
                    </span>
                  </span>
                  <span className={`plant-student-game-badge ${s.stalled ? "badge-game-stalled" : s.speciesName ? "badge-game-ok" : "badge-game-pending"}`}>
                    {s.stalled ? "정체" : s.speciesName ? "정상" : "신규"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="plant-empty-state" style={{ padding: "40px 20px" }}>
            {summary.students.length === 0 ? "아직 학생이 없어요." : "조건에 맞는 학생이 없어요."}
          </p>
        )}
      </section>

      {/* ── Matrix Preview ── */}
      {matrixPreviewStudents.length > 0 && (
        <section className="plant-matrix-game">
          <div className="plant-matrix-game-head">
            <h3>📊 학급 성장 매트릭스</h3>
            <div className="plant-matrix-game-stats">
              <span><strong>{summary.plantedCount}</strong>명</span>
              <span><strong>{stages.length}</strong>단계</span>
              <span><strong>{summary.plantedCount * 2}</strong>개 사진</span>
            </div>
          </div>
          <div className="plant-matrix-game-grid">
            <div className="plant-matrix-game-header">단계\학생</div>
            {matrixPreviewStudents.map((s) => (
              <div key={s.id} className="plant-matrix-game-header">{s.number ?? "—"}번</div>
            ))}
            {previewStages.map((st) => (
              <>
                <div key={`label-${st}`} className="plant-matrix-game-label">{st}. {["발아", "성장", "분화", "개화", "결실"][st - 1] ?? `${st}단계`}</div>
                {matrixPreviewStudents.map((s) => {
                  const isStalled = s.stalled;
                  const hasPlant = !!s.speciesName;
                  const isCurrent = s.currentStageOrder === st;
                  let cellClass = "mgc-empty";
                  if (isStalled && hasPlant) cellClass = "mgc-stale";
                  else if (hasPlant) cellClass = "mgc-photo";
                  if (isCurrent) cellClass += " mgc-current";
                  return (
                    <button
                      key={`${s.id}-${st}`}
                      type="button"
                      className={`plant-matrix-game-cell ${cellClass}`}
                      onClick={() => router.push(studentHref(s.id))}
                      title={`${s.name} · ${st}단계`}
                      aria-label={`${s.name} · ${st}단계`}
                    >
                      {hasPlant ? (isStalled ? "⏳" : ["🌱", "🌿", "🌻", "💐", "🍎"][st - 1] ?? "🌿") : "·"}
                    </button>
                  );
                })}
              </>
            ))}
          </div>
        </section>
      )}

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
