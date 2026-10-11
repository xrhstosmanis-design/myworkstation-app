// Use the complete session ledger summary, never a capped recent movement list.
export function currentShiftCash(session, summary) {
  if (!session || !summary) return null;
  const fields = { opening: session.openingOperational, receipts: summary.cashSales,
    expenses: summary.expensesTotal, transferIn: summary.transferIn, transferOut: summary.transferOut };
  if (Object.values(fields).some(value => value === null || value === undefined || !Number.isFinite(Number(value)))) return null;
  const cents = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Math.round(Number(value) * 100)]));
  return { ...Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, value / 100])),
    balance: (cents.opening + cents.receipts + cents.transferIn - cents.expenses - cents.transferOut) / 100 };
}
