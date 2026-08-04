"use client";

import type { ReactNode } from "react";
import { StudentActivityTabs } from "./StudentActivityTabs";
import type { StudentActivityView } from "./StudentActivityHeader";

type Props = {
  records: ReactNode;
  missions: ReactNode;
  titles: ReactNode;
  initialView?: StudentActivityView;
};

/** Walking uses the same record, mission, and title tabs as the mobile app. */
export function StudentWalkingTabs({
  records,
  missions,
  titles,
  initialView,
}: Props) {
  return (
    <StudentActivityTabs
      activity="walking"
      records={records}
      missions={missions}
      titles={titles}
      initialView={initialView}
    />
  );
}
