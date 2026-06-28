"use client";

import { useState } from "react";
import { AddCardModal, type AddCardData } from "./AddCardModal";

type Props = {
  onAdd: (data: AddCardData) => Promise<void>;
  sections?: { id: string; title: string }[];
  canAssignAuthors?: boolean;
  canConfigurePoll?: boolean;
  classroomId?: string | null;
};

export function AddCardButton({
  onAdd,
  sections,
  canAssignAuthors,
  canConfigurePoll,
  classroomId,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="add-card-fab"
        onClick={() => setOpen(true)}
        aria-label="카드 추가"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      {open && (
        <AddCardModal
          onAdd={onAdd}
          onClose={() => setOpen(false)}
          sections={sections}
          canAssignAuthors={canAssignAuthors}
          canConfigurePoll={canConfigurePoll}
          classroomId={classroomId}
        />
      )}
    </>
  );
}
