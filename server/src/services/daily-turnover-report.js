import {normalizeBusinessText} from '../../../shared/assistant-business.mjs';

import {salesReportCalendar} from './sales-report-calendar.js';
import {reportDayOffset} from './automatic-report-policy.js';
import {summarizeDailyTurnover} from './daily-turnover-summary.js';

export function isDailyTurnoverQuestion(question) {
  const normalized = normalizeBusinessText(question);
  return /τζιρ/.test(normalized) && /ανα (?:ημερ|μερ)|μεταβολ|αυξησ|μειωσ/.test(normalized);
}

export function isShiftTurnoverQuestion(question) {
  const normalized = normalizeBusinessText(question);
  return /τζιρ|πωλησ/.test(normalized) && /βαρδι/.test(normalized)
    && /ανα.{0,24}βαρδι|μεσ[οη]|πρωιν|μεσημερ|βραδιν/.test(normalized);
}

export async function readShiftTurnover(db, {companyId, storeId, from, to}, now = new Date()) {
  const period = salesReportCalendar(from, to);
  if (!companyId || !storeId) throw new Error('Απαιτείται επιλεγμένο κατάστημα.');

  const rows = await db.$queryRaw`
    SELECT to_char("openedAt" AT TIME ZONE 'Europe/Athens', 'YYYY-MM-DD') AS day,
      EXTRACT(HOUR FROM "openedAt" AT TIME ZONE 'Europe/Athens') AS hour,
      CASE WHEN status = 'CLOSED' AND "closedAt" <= ${now}
        THEN round("cashSales"::numeric * 100) END AS cash,
      CASE WHEN status = 'CLOSED' AND "closedAt" <= ${now}
        THEN round("cardSales"::numeric * 100) END AS card
    FROM "CashShiftSession"
    WHERE "companyId" = ${companyId} AND "storeId" = ${storeId}
      AND "openedAt" >= ${period.from} AND "openedAt" < ${period.to}
  `;
  const seen = new Set();
  const incomplete = new Set();
  const shifts = ['Πρωινή', 'Μεσημεριανή', 'Βραδινή'].map(name => ({
    name, count: 0, cash: 0, card: 0,
  }));
  for (const row of rows) {
    seen.add(row.day);
    const hour = Number(row.hour);
    const cash = Number(row.cash);
    const card = Number(row.card);
    if (row.cash == null || row.card == null || !Number.isSafeInteger(cash) || !Number.isSafeInteger(card)) {
      incomplete.add(row.day);
      continue;
    }
    const shift = shifts[hour < 5 || hour >= 21 ? 2 : hour < 13 ? 0 : 1];
    shift.count++;
    shift.cash += cash;
    shift.card += card;
  }
  for (let day = from; day <= to; day = reportDayOffset(day, 1)) {
    if (!seen.has(day)) incomplete.add(day);
  }
  const incompleteDays = [...incomplete].sort();
  if (period.to > now || incompleteDays.length) return {status: 'INCOMPLETE', from, to, incompleteDays};
  return {status: 'AVAILABLE', from, to, shifts};
}

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
  if (report.shifts) {
    const lines = report.shifts.map(({name, count, cash, card}) => {
      if (!count) return `${name} · Καμία καταγεγραμμένη βάρδια`;
      return `${name} · ${count} κλεισίματα · μετρητά ${money(cash)} · κάρτες ${money(card)} · σύνολο ${money(cash + card)} · μέσος τζίρος ${money((cash + card) / count)}`;
    });
    return {
      answer: [`${storeName} · Τζίρος ανά βάρδια (${report.from} – ${report.to})`, ...lines].join('\n'),
      highlights: [],
      limitations: 'Ομαδοποίηση ανά ώρα έναρξης στην Ελλάδα: πρωινή 05:00–12:59, μεσημεριανή 13:00–20:59, βραδινή 21:00–04:59. Κάθε καταγεγραμμένο κλείσιμο μετρά χωριστά.',
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
