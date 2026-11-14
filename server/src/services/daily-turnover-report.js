import {salesReportCalendar} from './sales-report-calendar.js';
import {reportDayOffset} from './automatic-report-policy.js';
import {summarizeDailyTurnover} from './daily-turnover-summary.js';

export async function readDailyTurnover(db, {companyId, storeId, from, to}, now = new Date()) {
  const period = salesReportCalendar(from, to);
  if (!companyId || !storeId) throw new Error('Απαιτείται επιλεγμένο κατάστημα.');

  const rows = await db.$queryRaw`
    SELECT to_char("openedAt" AT TIME ZONE 'Europe/Athens', 'YYYY-MM-DD') AS day,
      SUM(CASE WHEN status = 'CLOSED' THEN round("cashSales"::numeric * 100)
        + round("cardSales"::numeric * 100) ELSE 0 END) AS cents,
      COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'CLOSED'
        OR "closedAt" IS NULL OR "closedAt" > ${now}
        OR "cashSales" IS NULL OR "cardSales" IS NULL) AS incomplete
    FROM "CashShiftSession"
    WHERE "companyId" = ${companyId} AND "storeId" = ${storeId}
      AND "openedAt" >= ${period.from} AND "openedAt" < ${period.to}
    GROUP BY 1 ORDER BY 1
  `;

  const recorded = new Map(rows.map(row => [row.day, row]));
  const dailyTotals = new Map();
  const incompleteDays = [];
  for (let day = from; day <= to; day = reportDayOffset(day, 1)) {
    const row = recorded.get(day);
    if (!row || Number(row.incomplete) > 0 || !Number.isSafeInteger(Number(row.cents))) {
      incompleteDays.push(day);
    } else {
      dailyTotals.set(day, Number(row.cents));
    }
  }
  if (period.to > now || incompleteDays.length) {
    return {status: 'INCOMPLETE', from, to, incompleteDays};
  }
  return {status: 'AVAILABLE', ...summarizeDailyTurnover({fromDay: from, toDay: to, dailyTotals})};
}

const euro = new Intl.NumberFormat('el-GR', {style: 'currency', currency: 'EUR'});
const percent = new Intl.NumberFormat('el-GR', {style: 'percent', maximumFractionDigits: 1});
const money = cents => euro.format(cents / 100);
const signedMoney = cents => (cents > 0 ? '+' : '') + money(cents);

export function dailyTurnoverAnswer(report, storeName) {
  if (report.status !== 'AVAILABLE') {
    return {
      answer: `Δεν υπάρχει πλήρης αναφορά κλεισμένων βαρδιών για ${storeName} (${report.from} – ${report.to}).`,
      highlights: [],
      limitations: report.incompleteDays.length ? `Ημέρες προς επιβεβαίωση: ${report.incompleteDays.join(', ')}.` : '',
    };
  }
  const lines = report.days.map(row => {
    if (row.changeCents === null) return `${row.day} · ${money(row.turnoverCents)}`;
    const change = signedMoney(row.changeCents);
    const rate = row.changePercent === null ? '' : ` (${percent.format(row.changePercent / 100)})`;
    return `${row.day} · ${money(row.turnoverCents)} · ${change}${rate}`;
  });
  const highlights = [];
  if (report.largestIncrease) highlights.push(`Μεγαλύτερη αύξηση: ${report.largestIncrease.day} · ${signedMoney(report.largestIncrease.changeCents)}`);
  if (report.largestDecrease) highlights.push(`Μεγαλύτερη μείωση: ${report.largestDecrease.day} · ${signedMoney(report.largestDecrease.changeCents)}`);
  return {
    answer: [`${storeName} · Συνολικός τζίρος ${money(report.totalCents)}`, ...lines].join('\n'),
    highlights,
    limitations: 'Μετρητά και κάρτες από κλεισμένες βάρδιες, με ημερομηνία έναρξης σε ώρα Ελλάδας.',
  };
}
