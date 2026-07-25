"use client";

import { useState } from "react";

export type StudentActivityKey = "walking" | "reading";
export type StudentActivityView = "records" | "missions";

type Props = {
  active: StudentActivityKey;
  view?: StudentActivityView;
  onViewChange?: (view: StudentActivityView) => void;
};

/** Shared student self-directed activity heading and local navigation. */
export function StudentActivityHeader({
  active,
  view,
  onViewChange,
}: Props) {
  const title = active === "walking" ? "걷기" : "독서";
  const [internalView, setInternalView] = useState<StudentActivityView>("records");
  const selectedView = view ?? internalView;
  const activityLabel = title;

  const selectView = (nextView: StudentActivityView) => {
    if (view === undefined) setInternalView(nextView);
    onViewChange?.(nextView);
  };

  const moveView = (current: StudentActivityView, direction: -1 | 1) => {
    const tabOrder: StudentActivityView[] = ["records", "missions"];
    const currentIndex = tabOrder.indexOf(current);
    return tabOrder[(currentIndex + direction + tabOrder.length) % tabOrder.length];
  };

  return (
    <header className="student-activity-header">
      <div className="student-activity-heading">
        <p className="student-activity-eyebrow">자율활동</p>
        <h1 className="student-activity-title">{title}</h1>
      </div>

      {
        <div
          className="student-activity-navigation"
          role="tablist"
          aria-label={`${activityLabel} 보기`}
          aria-orientation="horizontal"
        >
          {(["records", "missions"] as const).map((view) => {
            const isSelected = selectedView === view;
            const label = view === "records" ? "기록" : "미션";
            return (
              <button
                key={view}
                id={`student-${active}-${view}-tab`}
                className="student-activity-tab"
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`student-${active}-${view}-panel`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectView(view)}
                onKeyDown={(event) => {
                  let nextView: StudentActivityView | null = null;
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    nextView = moveView(view, 1);
                  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    nextView = moveView(view, -1);
                  } else if (event.key === "Home") {
                    nextView = "records";
                  } else if (event.key === "End") {
                    nextView = "missions";
                  }

                  if (!nextView) return;
                  event.preventDefault();
                  selectView(nextView);
                  document.getElementById(`student-${active}-${nextView}-tab`)?.focus();
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      }
    </header>
  );
}
