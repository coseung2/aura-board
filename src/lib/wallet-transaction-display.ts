export type WalletTransactionDisplayInput = {
  type: string;
  note: string | null;
  sourceType?: string | null;
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
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

const SOURCE_TYPE_LABELS: Record<string, string> = {
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
  teacher_transaction_correction: "거래 정정",
  avatar_purchase: "캐릭터 상점 구매",
  creature_egg_purchase: "펫 알 구매",
  creature_item_purchase: "펫 아이템 구매",
  slime_purchase: "슬라임 구매",
  slime_refund: "슬라임 환불",
  slime_item_purchase: "슬라임 아이템 구매",
  slime_item_refund: "슬라임 아이템 환불",
};

const MACHINE_NOTE_PREFIX = /^(?:slime|creature)-(?:item-|egg-)?(?:purchase|refund):/i;
const REWARD_FALLBACK_NOTE = /^[a-z][a-z0-9_]*\s+reward\s+\[[^\]]+\]$/i;

export function walletTransactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? "거래";
}

/**
 * Removes implementation identifiers from system-created ledger notes. Notes
 * entered by a teacher for an ordinary deposit/withdrawal remain untouched.
 */
export function walletTransactionNoteLabel(
  input: WalletTransactionDisplayInput,
): string | null {
  const note = input.note?.normalize("NFC").trim() || null;
  const sourceLabel = input.sourceType ? SOURCE_TYPE_LABELS[input.sourceType] : null;

  if (!note) return sourceLabel;
  if (MACHINE_NOTE_PREFIX.test(note) || REWARD_FALLBACK_NOTE.test(note)) {
    return sourceLabel ?? walletTransactionTypeLabel(input.type);
  }

  if (!sourceLabel) return note;

  const withoutInternalMetadata = note
    .replace(/\s*\[[^\]]*[A-Za-z0-9:_-][^\]]*\]\s*$/u, "")
    .replace(/\s*\(tier\d+\)\s*$/iu, "")
    .trim();

  return withoutInternalMetadata || sourceLabel;
}

export function getWalletTransactionDisplay(input: WalletTransactionDisplayInput) {
  return {
    typeLabel: walletTransactionTypeLabel(input.type),
    noteLabel: walletTransactionNoteLabel(input),
  };
}
