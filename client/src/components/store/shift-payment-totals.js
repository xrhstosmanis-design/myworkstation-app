export function addSalePaymentTotals(totals, sale) {
  totals.total += sale.amount;
  if (sale.payments?.length) {
    for (const payment of sale.payments) {
      const key = { CASH: "cash", CARD: "card", IRIS: "iris" }[payment.method];
      if (key) totals[key] += Number(payment.amount || 0);
    }
  } else if (sale.type === "SALE_CASH") totals.cash += sale.amount;
  else if (sale.type === "SALE_IRIS") totals.iris += sale.amount;
  else totals.card += sale.amount;
}

// cardSales already includes IRIS in the complete server ledger. Recent rows
// describe activity and may be capped; they cannot determine collected totals.
export function shiftCollectionTotals(summary) {
  const values = ['cashSales', 'cardSales', 'irisSales'].map(key => summary?.[key]);
  if (values.some(value => value === null || value === undefined || !Number.isFinite(Number(value)))) return null;
  const [cash, combinedCard, iris] = values.map(value => Math.round(Number(value) * 100));
  return { cash: cash / 100, card: (combinedCard - iris) / 100, iris: iris / 100, total: (cash + combinedCard) / 100 };
}
