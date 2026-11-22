import {reportDayOffset} from './automatic-report-policy.js';

export function summarizeDailyTurnover({fromDay, toDay, dailyTotals}) {
  const days = [];
  let totalCents = 0;
  let largestIncrease = null;
  let largestDecrease = null;

  for (let day = fromDay; day <= toDay; day = reportDayOffset(day, 1)) {
    const turnoverCents = dailyTotals.get(day);
    if (!Number.isSafeInteger(turnoverCents)) {
      throw new Error(`Missing or invalid turnover for ${day}`);
    }

    const previous = days.at(-1);
    const changeCents = previous ? turnoverCents - previous.turnoverCents : null;
    const changePercent = previous?.turnoverCents > 0
      ? (changeCents / previous.turnoverCents) * 100
      : null;
    totalCents += turnoverCents;
    if (!Number.isSafeInteger(totalCents) || (previous && !Number.isSafeInteger(changeCents))) {
      throw new Error('Turnover exceeds safe integer precision');
    }

    const row = {day, turnoverCents, changeCents, changePercent};
    days.push(row);
    if (changeCents > 0 && (!largestIncrease || changeCents > largestIncrease.changeCents)) {
      largestIncrease = row;
    }
    if (changeCents < 0 && (!largestDecrease || changeCents < largestDecrease.changeCents)) {
      largestDecrease = row;
    }
  }

  return {fromDay, toDay, totalCents, days, largestIncrease, largestDecrease};
}
