"use client";

import type { ChildRow } from "./ParentChildSelector";
import { ParentPortfolioView } from "../portfolio/ParentPortfolioView";
import { ParentPendingLinks, type ParentPendingLink } from "./ParentPendingLinks";

type Props = {
  children: ChildRow[];
  initialSelectedId: string;
  pendingLinks?: ParentPendingLink[];
};

export function ParentDashboard({
  children: childRows,
  initialSelectedId,
  pendingLinks = [],
}: Props) {
  const selected =
    childRows.find((c) => c.studentId === initialSelectedId) ?? childRows[0];

  return (
    <>
      <ParentPendingLinks links={pendingLinks} compact />

      {selected ? (
        <ParentPortfolioView
          key={selected.studentId}
          childId={selected.studentId}
          childName={selected.studentName}
        />
      ) : (
        <div className="portfolio-empty">
          <p>자녀가 선택되지 않았어요.</p>
        </div>
      )}
    </>
  );
}
