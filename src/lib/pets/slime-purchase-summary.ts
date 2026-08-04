export type SlimePurchaseBalanceSummary = Readonly<{
  unitPrice: number;
  quantity: number;
  total: number;
  currentBalance: number;
  remainingBalance: number;
  shortOnFunds: boolean;
}>;

/** Shared wallet preview; the server remains authoritative for ledger safety. */
export function calculateSlimePurchaseBalanceSummary(
  unitPrice: number,
  quantity: number,
  balance: number,
): SlimePurchaseBalanceSummary {
  const normalizedPrice = Math.max(0, Math.trunc(unitPrice));
  const normalizedQuantity = Math.max(1, Math.trunc(quantity));
  const normalizedBalance = Math.trunc(balance);
  const total = normalizedPrice * normalizedQuantity;
  const remainingBalance = normalizedBalance - total;
  return {
    unitPrice: normalizedPrice,
    quantity: normalizedQuantity,
    total,
    currentBalance: normalizedBalance,
    remainingBalance,
    shortOnFunds: remainingBalance < 0,
  };
}
