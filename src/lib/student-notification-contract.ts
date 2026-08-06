import "server-only";

import {
  ACTIVITY_REWARD_SOURCE_TYPES,
  type ActivityRewardSourceType,
} from "@/lib/creatures/activity-rewards";

export const STUDENT_NOTIFICATION_KINDS = [
  "like",
  "comment",
  "reply",
  "wallet",
  "reward",
  "refund",
  "attendance",
  "assignment",
] as const;
export type StudentNotificationKind = (typeof STUDENT_NOTIFICATION_KINDS)[number];

export const STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES =
  ACTIVITY_REWARD_SOURCE_TYPES;
export type StudentNotificationRewardSourceType = ActivityRewardSourceType;

/**
 * Refund ledger source that students are told about.
 *
 * Mirrors `SLIME_ITEM_REFUND_SOURCE_TYPE`. Refunds are the one case where money
 * arrives without the student doing anything, so they would otherwise land in
 * the wallet silently.
 */
export const STUDENT_NOTIFICATION_REFUND_SOURCE_TYPE = "slime_item_refund" as const;

/** Item key embedded in a refund note, when the note still carries one. */
export function studentRefundItemKey(note: string | null): string | null {
  if (!note) return null;
  const match = /^slime-item-refund:(.+)$/.exec(note);
  return match?.[1] ?? null;
}

export function studentRewardTitle(
  sourceType: StudentNotificationRewardSourceType,
): string {
  switch (sourceType) {
    case "reading_reward":
      return "독서 보상";
    case "comment_reward":
      return "댓글 보상";
    case "walking_reward":
      return "걷기 보상";
    case "walking_weekly_reward":
      return "주간 걷기 보상";
    case "walking_classroom_rank_reward":
      return "우리 반 걷기 순위 보상";
    case "assignment_reward":
      return "과제 제출 보상";
    case "attendance_reward":
      return "출석 보상";
    case "reading_weekly_mission_reward":
      return "주간 독서 미션 보상";
    case "reading_classroom_rank_reward":
      return "우리 반 독서 순위 보상";
  }
}
