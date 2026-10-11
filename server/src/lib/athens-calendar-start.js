const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

// Calendar midnight and the next calendar midnight can have different offsets
// on DST days; adding 24 elapsed hours to an Athens midnight is incorrect.
export function athensCalendarStart(value, days = 0) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const target = parsed.getTime() + days * 86400000;
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    guess += target - local;
  }
  return new Date(guess);
}
