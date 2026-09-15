"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { ClassroomNameField } from "./ClassroomNameField";
import { ClassroomDeleteModal } from "./ClassroomDeleteModal";
import { ClassroomFirstRunSpotlight } from "./ClassroomFirstRunSpotlight";
import { notifyClassroomListChanged } from "@/lib/client-lookup-cache";

export type DashboardKpi = {
  label: string;
  value: string;
};

type Props = {
  classroomId: string;
  classroomName: string;
  summaryKpis: DashboardKpi[];
  /** 학급을 막 만든 직후 첫 진입 — 학생 명단 카드를 강조하는 1회성 안내. */
  firstRunTutorial?: boolean;
};

/**
 * Read-only classroom overview.
 *
 * The classroom header keeps the name actions available, while the body is a
 * compact summary of the data already loaded by the server page. Feature
 * destinations remain owned by their existing routes and are not repeated
 * inside this overview.
 */
export function ClassroomDashboardSections({
  classroomId,
  classroomName,
  summaryKpis,
  firstRunTutorial = false,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(classroomName);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [showClassroomDelete, setShowClassroomDelete] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(firstRunTutorial);

  // 안내는 생성 직후 한 번만. 주소에서 표시를 지워 새로고침으로 다시 뜨지
  // 않게 한다.
  useEffect(() => {
    if (!firstRunTutorial) return;
    router.replace(`/classroom/${classroomId}/dashboard`);
  }, [classroomId, firstRunTutorial, router]);

  const dismissFirstRun = useCallback(() => setShowFirstRun(false), []);

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

  async function handleDeleteClassroom() {
    const response = await fetch(`/api/classroom/${classroomId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmName: name }),
    });
    if (!response.ok) {
      throw new Error("학급 삭제에 실패했습니다.");
    }
    notifyClassroomListChanged();
    router.push("/classroom");
    router.refresh();
  }

  return (
    <>
      <header className="classroom-section-header">
        <div className="classroom-section-heading">
          <ClassroomNameField
            name={name}
            renaming={renaming}
            error={renameError}
            onRename={(next) => void handleRename(next)}
            actions={
              <button
                type="button"
                className="classroom-detail-delete classroom-name-delete"
                onClick={() => setShowClassroomDelete(true)}
                title="학급 삭제"
                aria-label="학급 삭제"
              >
                <Trash2 size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
            }
          />
        </div>
      </header>

      <ClassroomDeleteModal
        open={showClassroomDelete}
        classroomName={name}
        pendingCount={0}
        activeCount={0}
        onConfirm={handleDeleteClassroom}
        onCancel={() => setShowClassroomDelete(false)}
      />

      {showFirstRun && (
        <ClassroomFirstRunSpotlight
          targetId="classroom-card-students"
          message="학생 명단에서 학생을 추가하세요"
          actionHref={`/classroom/${classroomId}/students?add=1`}
          actionLabel="학생 추가"
          onDismiss={dismissFirstRun}
        />
      )}

      <section
        className="classroom-overview"
        aria-labelledby="classroom-overview-heading"
      >
        <h2 id="classroom-overview-heading">학급 현황</h2>
        <dl className="classroom-overview-summary">
          {summaryKpis.map((kpi) => (
            <div className="classroom-overview-summary-item" key={kpi.label}>
              <dt>{kpi.label}</dt>
              <dd>{kpi.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
