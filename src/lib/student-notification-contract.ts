import "server-only";

import {
  ACTIVITY_REWARD_SOURCE_TYPES,
  type ActivityRewardSourceType,
} from "@/lib/creatures/activity-rewards";

export const STUDENT_NOTIFICATION_KINDS = ["like", "comment", "reward"] as const;
export type StudentNotificationKind = (typeof STUDENT_NOTIFICATION_KINDS)[number];

export const STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES =
  ACTIVITY_REWARD_SOURCE_TYPES;
export type StudentNotificationRewardSourceType = ActivityRewardSourceType;

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
