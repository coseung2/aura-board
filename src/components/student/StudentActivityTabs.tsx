"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import {
  StudentActivityHeader,
  type StudentActivityKey,
  type StudentActivityView,
} from "./StudentActivityHeader";

type Props = {
  activity: StudentActivityKey;
  records: ReactNode;
  missions: ReactNode;
  titles?: ReactNode;
  initialView?: StudentActivityView;
};

/** Shared local record, mission, and title navigation for activity pages. */
export function StudentActivityTabs({
  activity,
  records,
  missions,
  titles,
  initialView = "records",
}: Props) {
  const [activeView, setActiveView] = useState<StudentActivityView>(initialView);
  const prefix = `student-${activity}`;
  const views: readonly StudentActivityView[] = titles
    ? ["records", "missions", "titles"]
    : ["records", "missions"];

  const selectView = (nextView: StudentActivityView) => {
    setActiveView(nextView);
    const url = new URL(window.location.href);
    if (nextView === "records") url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextView);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <>
      <StudentActivityHeader
        active={activity}
        view={activeView}
        views={views}
        onViewChange={selectView}
      />
      <section
        id={`${prefix}-records-panel`}
        className="student-activity-tabpanel"
        role="tabpanel"
        aria-labelledby={`${prefix}-records-tab`}
        tabIndex={0}
        hidden={activeView !== "records"}
      >
        {records}
      </section>
      <section
        id={`${prefix}-missions-panel`}
        className="student-activity-tabpanel"
        role="tabpanel"
        aria-labelledby={`${prefix}-missions-tab`}
        tabIndex={0}
        hidden={activeView !== "missions"}
      >
        {missions}
      </section>
      {titles ? (
        <section
          id={`${prefix}-titles-panel`}
          className="student-activity-tabpanel"
          role="tabpanel"
          aria-labelledby={`${prefix}-titles-tab`}
          tabIndex={0}
          hidden={activeView !== "titles"}
        >
          {titles}
        </section>
      ) : null}
    </>
  );
}
