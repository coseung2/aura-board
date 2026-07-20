const CREDIT_TRANSACTION_TYPES = new Set([
  "deposit",
  "refund",
  "fd_matured",
  "fd_cancelled",
  "correction_credit",
]);

export const TRANSACTION_CORRECTION_SOURCE_TYPE = "teacher_transaction_correction";

export function isCreditTransactionType(type: string): boolean {
  return CREDIT_TRANSACTION_TYPES.has(type);
}

export function isCorrectionTransaction(type: string): boolean {
  return type === "correction_credit" || type === "correction_debit";
}

export function isManuallyCorrectableTransactionType(type: string): boolean {
  return type === "deposit" || type === "withdraw";
}
