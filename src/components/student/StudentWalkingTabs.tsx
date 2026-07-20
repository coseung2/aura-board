"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  StudentActivityHeader,
  type WalkingView,
} from "@/components/student/StudentActivityHeader";

type Props = {
  records: ReactNode;
  missions: ReactNode;
};

/**
 * Owns the walking page's local tab state so switching views replaces the
 * panel below the bold activity rule instead of scrolling to an anchor.
 */
export function StudentWalkingTabs({ records, missions }: Props) {
  const [activeView, setActiveView] = useState<WalkingView>("records");

  return (
    <>
      <StudentActivityHeader
        active="walking"
        walkingView={activeView}
        onWalkingViewChange={setActiveView}
      />

      <section
        id="student-walking-records-panel"
        className="student-walking-tabpanel"
        role="tabpanel"
        aria-labelledby="student-walking-records-tab"
        tabIndex={0}
        hidden={activeView !== "records"}
      >
        {records}
      </section>
      <section
        id="student-walking-missions-panel"
        className="student-walking-tabpanel"
        role="tabpanel"
        aria-labelledby="student-walking-missions-tab"
        tabIndex={0}
        hidden={activeView !== "missions"}
      >
        {missions}
      </section>
    </>
  );
}
