const TYPE_LABELS: Record<string, string> = {
  deposit: "입금",
  withdraw: "출금",
  purchase: "결제",
  refund: "환불",
  fd_open: "적금 가입",
  fd_matured: "적금 만기",
  fd_cancelled: "적금 해지",
  avatar_purchase: "캐릭터 상점 구매",
  creature_egg_purchase: "펫 알 구매",
  creature_item_purchase: "펫 아이템 구매",
  slime_purchase: "슬라임 구매",
  slime_refund: "슬라임 환불",
  slime_item_purchase: "슬라임 아이템 구매",
  slime_item_refund: "슬라임 아이템 환불",
  correction_credit: "정정 입금",
  correction_debit: "정정 출금",
};

const SOURCE_LABELS: Record<string, string> = {
  reading_reward: "독서 보상",
  reading_reward_reversal: "독서 보상 회수",
  comment_reward: "댓글 작성 보상",
  walking_reward: "일간 걷기 보상",
  walking_weekly_reward: "주간 걷기 보상",
  walking_classroom_rank_reward: "우리 반 걷기 순위 보상",
  assignment_reward: "과제 제출 보상",
  attendance_reward: "출석 보상",
  attendance_cookie_reward: "출석 쿠키 보상",
  reading_weekly_mission_reward: "주간 독서 미션 보상",
  reading_classroom_rank_reward: "우리 반 독서 순위 보상",
  classroom_role_salary: "학급 역할 급여",
  slime_purchase: "슬라임 구매",
  slime_refund: "슬라임 환불",
  slime_item_purchase: "슬라임 아이템 구매",
  slime_item_refund: "슬라임 아이템 환불",
  creature_egg_purchase: "펫 알 구매",
  creature_item_purchase: "펫 아이템 구매",
};

type Transaction = {
  type: string;
  note: string | null;
  displayNote?: string | null;
  typeLabel?: string;
  sourceType?: string | null;
};

export function mobileWalletTransactionLabel(transaction: Transaction): string {
  if (transaction.displayNote) return transaction.displayNote;

  const note = transaction.note?.normalize("NFC").trim();
  const sourceLabel = transaction.sourceType
    ? SOURCE_LABELS[transaction.sourceType]
    : null;
  if (!note) {
    return sourceLabel ?? transaction.typeLabel ?? TYPE_LABELS[transaction.type] ?? "거래";
  }
  if (/^(?:slime|creature)-(?:item-|egg-)?(?:purchase|refund):/i.test(note)) {
    return sourceLabel ?? TYPE_LABELS[transaction.type] ?? "거래";
  }
  if (/^[a-z][a-z0-9_]*\s+reward\s+\[[^\]]+\]$/i.test(note)) {
    return sourceLabel ?? "보상";
  }
  return note;
}
