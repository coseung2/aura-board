"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShareSession } from "@/components/share/ShareSessionContext";
import { useBoardPollChange } from "@/hooks/useBoardEngagementRealtime";
import { studentViewerHeaders } from "./card-engagement-comments-model";

// comment-area poll (2026-06-28): 카드 댓글 영역 투표 UI.
type PollState = {
  enabled: boolean;
  optionCount: number;
  counts: number[];
  labels: string[];

  voters: Array<Array<{ id: string; name: string }>>;
  total: number;
  selectedOption: number | null;
  canVote: boolean;
};

export function CommentsPoll({
  cardId,
  shareSession,
  isStudentViewer,
  boardId,
}: {
  cardId: string;
  shareSession: ShareSession | null;
  isStudentViewer: boolean;
  boardId?: string;
}) {
  const [poll, setPoll] = useState<PollState | null>(null);
  const [voting, setVoting] = useState(false);
  const [openOption, setOpenOption] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (shareSession) {
      setPoll(null);
      return;
    }
    try {
      const r = await fetch(`/api/cards/${cardId}/poll`, {
        cache: "no-store",
        headers: studentViewerHeaders(isStudentViewer),
      });
      if (!r.ok) return;
      const j = (await r.json()) as PollState;
      setPoll(j);
    } catch {
      /* ignore */
    }
  }, [cardId, shareSession, isStudentViewer]);

  useEffect(() => {
    void load();
  }, [load]);

  useBoardPollChange(boardId, cardId, () => {
    void load();
  });

  const vote = async (optionIndex: number) => {
    if (
      shareSession ||
      voting ||
      !poll?.canVote ||
      poll.selectedOption === optionIndex
    )
      return;
    setVoting(true);
    setOpenOption(optionIndex);
    setPoll((current) => {
      if (!current) return current;
      const old = current.selectedOption;
      const nextCounts = [...current.counts];
      if (old !== null && old >= 0 && old < nextCounts.length) {
        nextCounts[old] = Math.max(0, nextCounts[old] - 1);
      }
      if (optionIndex >= 0 && optionIndex < nextCounts.length) {
        nextCounts[optionIndex]++;
      }
      return {
        ...current,
        selectedOption: optionIndex,
        counts: nextCounts,
        total: old === null ? current.total + 1 : current.total,
      };
    });
    try {
      const r = await fetch(`/api/cards/${cardId}/poll`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders(isStudentViewer),
        },
        body: JSON.stringify({ optionIndex }),
      });
      if (!r.ok) {
        await load();
        return;
      }
      const j = (await r.json()) as PollState;
      setPoll(j);
    } catch {
      await load();
    } finally {
      setVoting(false);
    }
  };

  if (!poll?.enabled) return null;

  const toggleOption = (optionIndex: number) => {
    if (poll.canVote && poll.selectedOption !== optionIndex) {
      void vote(optionIndex);
      return;
    }
    setOpenOption((current) => (current === optionIndex ? null : optionIndex));
  };
  const openVoters = openOption !== null ? (poll.voters[openOption] ?? []) : [];
  const openLabel =
    openOption !== null
      ? (poll.labels[openOption] ?? `${openOption + 1}번`)
      : "";

  return (
    <div className="card-engagement-poll" role="group" aria-label="투표">
      <div className="card-engagement-poll-options">
        {poll.counts.map((count, idx) => {
          const selected = poll.selectedOption === idx;
          const expanded = openOption === idx;
          const label = poll.labels[idx] ?? `${idx + 1}번`;
          return (
            <button
              key={idx}
              type="button"
              className={`card-engagement-poll-option${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`}
              onClick={() => toggleOption(idx)}
              disabled={voting}
              aria-pressed={selected}
              aria-expanded={expanded}
              aria-label={`${label} (${count}표), 투표자 보기`}
            >
              <span className="card-engagement-poll-option-label">{label}</span>
              <span className="card-engagement-poll-option-count">
                {count}표
              </span>
            </button>
          );
        })}
      </div>
      {openOption !== null && (
        <div className="card-engagement-poll-voters">
          <span className="card-engagement-poll-voters-title">
            {openLabel} 투표자
          </span>
          {openVoters.length > 0 ? (
            <span className="card-engagement-poll-voters-list">
              {openVoters.map((voter) => voter.name).join(", ")}
            </span>
          ) : (
            <span className="card-engagement-poll-voters-empty">
              아직 없어요
            </span>
          )}
        </div>
      )}
      <div className="card-engagement-poll-total">총 {poll.total}명 참여</div>
    </div>
  );
}
