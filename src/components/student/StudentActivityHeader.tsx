"use client";

import { useState } from "react";

export type StudentActivityKey = "walking" | "reading";
export type WalkingView = "records" | "missions";

type Props = {
  active: StudentActivityKey;
  walkingView?: WalkingView;
  onWalkingViewChange?: (view: WalkingView) => void;
};

/** Shared student self-directed activity heading and local navigation. */
export function StudentActivityHeader({
  active,
  walkingView,
  onWalkingViewChange,
}: Props) {
  const title = active === "walking" ? "걷기" : "독서";
  const [internalWalkingView, setInternalWalkingView] = useState<WalkingView>("records");
  const selectedWalkingView = walkingView ?? internalWalkingView;

  const selectWalkingView = (view: WalkingView) => {
    if (walkingView === undefined) setInternalWalkingView(view);
    onWalkingViewChange?.(view);
  };

  const moveWalkingView = (current: WalkingView, direction: -1 | 1) => {
    const tabOrder: WalkingView[] = ["records", "missions"];
    const currentIndex = tabOrder.indexOf(current);
    return tabOrder[(currentIndex + direction + tabOrder.length) % tabOrder.length];
  };

  return (
    <header className="student-activity-header">
      <div className="student-activity-heading">
        <p className="student-activity-eyebrow">자율활동</p>
        <h1 className="student-activity-title">{title}</h1>
      </div>

      {active === "walking" ? (
        <div
          className="student-activity-navigation"
          role="tablist"
          aria-label="걷기 보기"
          aria-orientation="horizontal"
        >
          {(["records", "missions"] as const).map((view) => {
            const isSelected = selectedWalkingView === view;
            const label = view === "records" ? "기록" : "미션";
            return (
              <button
                key={view}
                id={`student-walking-${view}-tab`}
                className="student-activity-tab"
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`student-walking-${view}-panel`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectWalkingView(view)}
                onKeyDown={(event) => {
                  let nextView: WalkingView | null = null;
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    nextView = moveWalkingView(view, 1);
                  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    nextView = moveWalkingView(view, -1);
                  } else if (event.key === "Home") {
                    nextView = "records";
                  } else if (event.key === "End") {
                    nextView = "missions";
                  }

                  if (!nextView) return;
                  event.preventDefault();
                  selectWalkingView(nextView);
                  document.getElementById(`student-walking-${nextView}-tab`)?.focus();
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
