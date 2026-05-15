"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const router = useRouter();

  const stages = Array.from({ length: 10 }, (_, i) => i + 1);

  const studentHref = (studentId: string) =>
    `/board/${boardId}/student/${studentId}`;

  const filteredStudents = summary.students.filter((s) => {
    if (studentFilter === "stalled") return s.stalled;
    if (studentFilter === "completed") return !s.stalled;
    return true;
  });

  return (
    <div className="plant-teacher">
      <nav className="plant-breadcrumb" aria-label="breadcrumb">
        <Link href={`/board/${boardId}`}>{boardTitle}</Link>
        <span className="plant-breadcrumb-sep">&gt;</span>
        <span>식물관찰일지</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>학급 식물 관찰일지</h2>
          <p style={{ margin: "4px 0", color: "var(--color-text-muted)" }}>
            식물 선택: {summary.plantedCount} / {summary.totalStudents}명
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowAllow(true)} className="plant-species-badge" style={{ fontSize: 13, padding: "6px 12px", background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-btn)", cursor: "pointer" }}>
            🌱 식물 허용 목록
          </button>
          <Link
            href={`/classroom/${classroomId}/plant-matrix`}
            className="plant-matrix-secondary-link"
          >
            📊 매트릭스 뷰 (전체 스캔)
          </Link>
        </div>
      </div>

      <h3 style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "8px 0" }}>단계별 분포</h3>
      <div className="plant-distribution">
        {stages.map((s) => (
          <div className="plant-dist-item" key={s}>
            <span className="plant-dist-count">{summary.distribution[String(s)] ?? 0}</span>
            <span className="plant-dist-label">{s}단계</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, margin: "18px 0 8px" }}>
        <h3 style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>학생</h3>
        <select
          className="plant-filter-select"
          value={studentFilter}
          aria-label="학생 상태 필터"
          onChange={(e) => setStudentFilter(e.target.value as StudentFilter)}
        >
          <option value="all">전체</option>
          <option value="stalled">정체 학생만</option>
          <option value="completed">완료 학생만</option>
        </select>
      </div>
      <table className="plant-student-table">
        <thead>
          <tr>
            <th>번호</th>
            <th>최근 사진</th>
            <th>이름</th>
            <th>식물</th>
            <th>현재 단계</th>
            <th>최근 관찰</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {filteredStudents.map((s) => {
            const recency = recencyIndicator(s.lastObservedAt);
            return (
              <tr
                key={s.id}
                className="plant-student-row-link"
                tabIndex={0}
                role="link"
                aria-label={`${s.name} 관찰일지 열기`}
                onClick={() => router.push(studentHref(s.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(studentHref(s.id));
                  }
                }}
              >
                <td>{s.number ?? "—"}</td>
              <td>
                <div
                  className="plant-student-thumb"
                  title={`최근 관찰: ${recency.label}`}
                  aria-label={`최근 관찰 ${recency.label}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}
                >
                  {recency.mark}
                </div>
              </td>
              <td>
                <Link
                  href={studentHref(s.id)}
                  className="plant-student-row-name"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.name}
                </Link>
              </td>
              <td>
                {s.speciesEmoji ? `${s.speciesEmoji} ${s.speciesName} (${s.nickname})` : "— 미선택 —"}
              </td>
              <td>{s.currentStageOrder ? `${s.currentStageOrder}. ${s.currentStageName}` : "—"}</td>
              <td>{formatAgo(s.lastObservedAt)}</td>
              <td>
                {s.stalled && <span className="plant-stalled-badge">정체 7일+</span>}
              </td>
            </tr>
            );
          })}
          {filteredStudents.length === 0 && (
            <tr>
              <td colSpan={7} className="plant-empty-state">
                {summary.students.length === 0 ? "아직 학생이 없어요." : "조건에 맞는 학생이 없어요."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

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
