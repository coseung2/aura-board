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
};

/** Shared local record/mission navigation for student activity pages. */
export function StudentActivityTabs({ activity, records, missions }: Props) {
  const [activeView, setActiveView] = useState<StudentActivityView>("records");
  const prefix = `student-${activity}`;

  return (
    <>
      <StudentActivityHeader
        active={activity}
        view={activeView}
        onViewChange={setActiveView}
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
    </>
  );
}
