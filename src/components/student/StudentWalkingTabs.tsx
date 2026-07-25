"use client";

import type { ReactNode } from "react";
import { StudentActivityTabs } from "./StudentActivityTabs";

type Props = {
  records: ReactNode;
  missions: ReactNode;
};

/**
 * Owns the walking page's local tab state so switching views replaces the
 * panel below the bold activity rule instead of scrolling to an anchor.
 */
export function StudentWalkingTabs({ records, missions }: Props) {
  return <StudentActivityTabs activity="walking" records={records} missions={missions} />;
}
