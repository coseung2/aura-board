"use client";

import Link from "next/link";
import { useState } from "react";
import { ClassroomDetail } from "@/components/ClassroomDetail";
import { ClassroomBankTab } from "./ClassroomBankTab";
import { ClassroomBoardsTab } from "./ClassroomBoardsTab";
import { ClassroomGroupsTab } from "./ClassroomGroupsTab";
import { ClassroomMorningDashboard } from "./ClassroomMorningDashboard";
import { ClassroomNameField } from "./ClassroomNameField";
import { ClassroomRolePanel } from "./ClassroomRolePanel";
import { notifyClassroomListChanged } from "@/lib/client-lookup-cache";
import type { Student } from "./StudentRow";
import type {
  GroupEditorDraft,
  GroupEditorStudent,
} from "./GroupRosterEditor";

/**
 * Classroom management shell.
 *
 * The nav mirrors the top-level "<classroom> 관리" mega-nav group. Selecting an
 * entry swaps the content in place instead of navigating, so the dashboard,
 * roster, seating, boards, and banking views share one header, one summary
 * strip, and one scroll context. Each section owns its own KPI row, so the
 * summary always matches the active nav item.
 */

export type DashboardSectionKey =
  | "dashboard"
  | "students"
  | "groups"
  | "boards"
  | "bank";

export type DashboardPortfolioRow = {
  id: string;
  number: number | null;
  name: string;
  itemCount: number;
};

export type DashboardKpi = {
  label: string;
  value: string;
};

export type ClassroomBoardSummary = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  updatedAt: string;
};

type Props = {
  classroomId: string;
  classroomName: string;
  /** Summary metrics per dashboard panel; the strip follows the active panel. */
  panelKpis: Record<OverviewPanelKey, DashboardKpi[]>;
  portfolio: DashboardPortfolioRow[];
  /** Currency unit label used by the role salary display. */
  unit: string;
  /** Section summaries shown when a non-dashboard nav item is active. */
  sectionKpis: Record<Exclude<DashboardSectionKey, "dashboard">, DashboardKpi[]>;
  rosterClassroom: {
    id: string;
    name: string;
    code: string;
    students: Student[];
    boards: Array<{ id: string; slug: string; title: string; layout: string }>;
  };
  seatingStudents: GroupEditorStudent[];
  seatingGroups: GroupEditorDraft[];
  linkedBoards: ClassroomBoardSummary[];
  allBoards: ClassroomBoardSummary[];
};

/** Dashboard-local content groups, switched inside the dashboard section. */
export type OverviewPanelKey =
  | "portfolio"
  | "roles"
  | "assignments"
  | "cleaning";

/**
 * Classroom management sections, matching the top nav's
 * "<classroom> 관리" group order.
 */
const SECTIONS: Array<{ key: DashboardSectionKey; label: string }> = [
  { key: "dashboard", label: "대시보드" },
  { key: "students", label: "학생 명단" },
  { key: "groups", label: "자리 배치" },
  { key: "boards", label: "학급 보드" },
  { key: "bank", label: "금융 관리" },
];

const OVERVIEW_PANELS: Array<{ key: OverviewPanelKey; label: string }> = [
  { key: "portfolio", label: "포트폴리오" },
  { key: "roles", label: "1인1역" },
  { key: "assignments", label: "과제" },
  { key: "cleaning", label: "청소" },
];

export function ClassroomDashboardSections({
  classroomId,
  classroomName,
  panelKpis,
  portfolio,
  unit,
  sectionKpis,
  rosterClassroom,
  seatingStudents,
  seatingGroups,
  linkedBoards,
  allBoards,
}: Props) {
  const [activeSection, setActiveSection] =
    useState<DashboardSectionKey>("dashboard");
  const [activePanel, setActivePanel] =
    useState<OverviewPanelKey>("portfolio");
  /** Divider-row slot that the role panel portals its pay controls into. */
  const [payBarSlot, setPayBarSlot] = useState<HTMLDivElement | null>(null);
  const [name, setName] = useState(classroomName);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function handleRename(next: string) {
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/classroom/${classroomId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setRenameError(body.error ?? `rename ${res.status}`);
        return;
      }
      setName(next);
      notifyClassroomListChanged();
    } catch (error) {
      setRenameError((error as Error).message);
    } finally {
      setRenaming(false);
    }
  }

  const activeKpis =
    activeSection === "dashboard"
      ? panelKpis[activePanel]
      : sectionKpis[activeSection];
  return (
    <>
      <header className="classroom-section-header">
        <div className="classroom-section-heading">
          <ClassroomNameField
            name={name}
            renaming={renaming}
            error={renameError}
            onRename={(next) => void handleRename(next)}
          />
        </div>

        <nav
          className="classroom-section-navigation"
          aria-label={`${name} 관리`}
        >
          {SECTIONS.map((section) => {
            const isActive = section.key === activeSection;
            return (
              <button
                key={section.key}
                type="button"
                id={`classroom-section-tab-${section.key}`}
                aria-current={isActive ? "page" : undefined}
                aria-controls={`classroom-section-panel-${section.key}`}
                className="classroom-section-nav-tab"
                onClick={() => setActiveSection(section.key)}
              >
                {section.label}
              </button>
            );
          })}
        </nav>
      </header>

      {activeKpis.length > 0 ? (
        <section className="classroom-dashboard-kpis" aria-label="학급 요약">
          {activeKpis.map((kpi) => (
            <article key={kpi.label} className="classroom-dashboard-kpi">
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
            </article>
          ))}
        </section>
      ) : null}

      <div
        className={`classroom-dashboard-section-body${
          activeSection === "bank" ? " is-flush" : ""
        }`}
        id={`classroom-section-panel-${activeSection}`}
        aria-labelledby={`classroom-section-tab-${activeSection}`}
      >
        {activeSection === "students" ? (
          <ClassroomDetail classroom={rosterClassroom} />
        ) : null}

        {activeSection === "groups" ? (
          <ClassroomGroupsTab
            classroomId={classroomId}
            students={seatingStudents}
            initialGroups={seatingGroups}
          />
        ) : null}

        {activeSection === "boards" ? (
          <ClassroomBoardsTab
            classroomId={classroomId}
            linkedBoards={linkedBoards}
            allBoards={allBoards}
          />
        ) : null}

        {activeSection === "bank" ? (
          <ClassroomBankTab classroomId={classroomId} />
        ) : null}

        {activeSection === "dashboard" ? (
          <>
        <div
          className="classroom-dashboard-panel-nav"
          role="tablist"
          aria-label="학급 요약 항목"
        >
          {OVERVIEW_PANELS.map((panel) => {
            const isActive = panel.key === activePanel;
            return (
              <button
                key={panel.key}
                type="button"
                role="tab"
                id={`classroom-dashboard-tab-${panel.key}`}
                aria-selected={isActive}
                aria-controls={`classroom-dashboard-panel-${panel.key}`}
                tabIndex={isActive ? 0 : -1}
                className={`classroom-strong-section-tab${isActive ? " is-active" : ""}`}
                onClick={() => setActivePanel(panel.key)}
              >
                {panel.label}
              </button>
            );
          })}
          <div
            className="classroom-dashboard-panel-nav-slot"
            ref={setPayBarSlot}
          />
        </div>

        <div
          role="tabpanel"
          id={`classroom-dashboard-panel-${activePanel}`}
          aria-labelledby={`classroom-dashboard-tab-${activePanel}`}
        >

        {activePanel === "portfolio" ? (
          <div className="classroom-dashboard-list">
            {portfolio.map((student) => (
              <Link
                key={student.id}
                href={`/classroom/${classroomId}/portfolio?student=${student.id}`}
                className="classroom-dashboard-row"
              >
                <span>
                  {student.number ?? "-"}번 {student.name}
                </span>
                <strong>{student.itemCount}개</strong>
              </Link>
            ))}
            {portfolio.length === 0 ? (
              <p className="classroom-dashboard-empty">
                아직 제출된 작품이 없습니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {activePanel === "assignments" ? (
          <ClassroomMorningDashboard
            classroomId={classroomId}
            classroomName={name}
            sections={["assignments"]}
            showToolbar={false}
          />
        ) : null}

        {activePanel === "cleaning" ? (
          <ClassroomMorningDashboard
            classroomId={classroomId}
            classroomName={name}
            sections={["duties"]}
            showToolbar={false}
          />
        ) : null}

        {activePanel === "roles" ? (
          <ClassroomRolePanel
            classroomId={classroomId}
            unit={unit}
            payBarSlot={payBarSlot}
            students={rosterClassroom.students.map((student) => ({
              id: student.id,
              name: student.name,
              number: student.number,
            }))}
          />
        ) : null}
        </div>
          </>
        ) : null}
      </div>
    </>
  );
}
