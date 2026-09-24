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
