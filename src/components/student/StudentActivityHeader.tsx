"use client";

import { useState } from "react";

export type StudentActivityKey = "walking" | "reading";
export type StudentActivityView = "records" | "missions" | "titles";

type Props = {
  active: StudentActivityKey;
  view?: StudentActivityView;
  views?: readonly StudentActivityView[];
  onViewChange?: (view: StudentActivityView) => void;
};

const ACTIVITY_LABELS: Record<StudentActivityKey, string> = {
  reading: "독서",
  walking: "걷기",
};

const VIEW_LABELS: Record<StudentActivityView, string> = {
  records: "기록",
  missions: "미션",
  titles: "칭호",
};

/** Activity heading and keyboard-operable local content tabs. */
export function StudentActivityHeader({
  active,
  view,
  views = ["records", "missions"],
  onViewChange,
}: Props) {
  const [internalView, setInternalView] = useState<StudentActivityView>("records");
  const selectedView = view ?? internalView;
  const activityLabel = ACTIVITY_LABELS[active];

  const selectView = (nextView: StudentActivityView) => {
    if (view === undefined) setInternalView(nextView);
    onViewChange?.(nextView);
  };

  const moveView = (current: StudentActivityView, direction: -1 | 1) => {
    const currentIndex = views.indexOf(current);
    return views[(currentIndex + direction + views.length) % views.length];
  };

  return (
    <header className="student-activity-header">
      <div className="student-activity-heading">
        <h2 className="student-activity-title">{activityLabel}</h2>
      </div>

      <div
        className="student-activity-navigation"
        role="tablist"
        aria-label={`${activityLabel} 보기`}
        aria-orientation="horizontal"
      >
        {views.map((localView) => {
          const isSelected = selectedView === localView;
          return (
            <button
              key={localView}
              id={`student-${active}-${localView}-tab`}
              className="student-activity-tab"
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`student-${active}-${localView}-panel`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectView(localView)}
              onKeyDown={(event) => {
                let nextView: StudentActivityView | null = null;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  nextView = moveView(localView, 1);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  nextView = moveView(localView, -1);
                } else if (event.key === "Home") {
                  nextView = views[0];
                } else if (event.key === "End") {
                  nextView = views[views.length - 1];
                }

                if (!nextView) return;
                event.preventDefault();
                selectView(nextView);
                document
                  .getElementById(`student-${active}-${nextView}-tab`)
                  ?.focus();
              }}
            >
              {VIEW_LABELS[localView]}
            </button>
          );
        })}
      </div>
    </header>
  );
}
