export const GREECE_TIME_ZONE = "Europe/Athens";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GREECE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function parts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Μη έγκυρη ημερομηνία και ώρα.");
  return Object.fromEntries(partsFormatter.formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}
export function greeceDateInput(value = new Date()) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}
export function greeceDateTimeInput(value = new Date(), seconds = false) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}${seconds ? `:${p.second}` : ""}`;
}
// datetime-local has no offset. Interpret its wall clock in Greece, never in
// the browser/server zone. Reject nonexistent or ambiguous DST wall clocks.
export function greeceDateTimeToIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/.exec(String(value || ""));
  if (!match) throw new Error("Συμπλήρωσε ημερομηνία και ώρα Ελλάδας.");
  const [, y, mo, d, h, mi, s = "00", fraction = ""] = match;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +(fraction.slice(1).padEnd(3, "0") || 0));
  const normalized = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const candidates = [2, 3].map(offset => new Date(wall - offset * 3600000))
    .filter(date => greeceDateTimeInput(date, true) === normalized);
  if (!candidates.length) throw new Error("Αυτή η ώρα δεν υπάρχει στην Ελλάδα λόγω αλλαγής ώρας ή μη έγκυρης ημερομηνίας.");
  if (candidates.length > 1) throw new Error("Αυτή η ώρα εμφανίζεται δύο φορές στην αλλαγή χειμερινής ώρας. Επίλεξε μια σαφή ώρα.");
  return candidates[0].toISOString();
}
