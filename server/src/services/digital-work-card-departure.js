const MINUTE_MS = 60_000;
const REMINDER_LEAD_MS = 3 * MINUTE_MS;
const EARLY_REASON_THRESHOLD_MS = 10 * MINUTE_MS;

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN;
  return Date.parse(value);
}

/**
 * The caller supplies the declared end of the matched ERGANI shift as an instant,
 * including the following calendar date for an overnight shift.
 */
export function digitalWorkCardDeparture({
  declaredEndAt,
  entryAcceptedAt,
  departureAcceptedAt,
  departureAt,
  reason,
  now = new Date()
}) {
  const declaredEnd = timestamp(declaredEndAt);
  const entry = timestamp(entryAcceptedAt);
  const acceptedDeparture = timestamp(departureAcceptedAt);
  const awaitingDeparture = Number.isFinite(entry)
    && !(Number.isFinite(acceptedDeparture) && acceptedDeparture >= entry);
  const hasSchedule = Number.isFinite(declaredEnd);
  const departure = timestamp(departureAt);
  const requiresReason = hasSchedule && Number.isFinite(departure)
    && declaredEnd - departure >= EARLY_REASON_THRESHOLD_MS;

  return {
    hasSchedule,
    awaitingDeparture,
    showReminder: hasSchedule && awaitingDeparture
      && timestamp(now) >= Math.max(entry, declaredEnd - REMINDER_LEAD_MS),
    requiresReason,
    reasonPending: requiresReason && !(typeof reason === "string" && reason.trim())
  };
}

// Only sessions already matched to the current cash shift may affect its close.
export function cashShiftRequiresDigitalDeparture({storeId, employeeId, cashShiftId, workSession}) {
  if (!storeId || !employeeId || !cashShiftId || !workSession
    || workSession.storeId !== storeId
    || workSession.employeeId !== employeeId
    || workSession.cashShiftId !== cashShiftId) return false;

  return digitalWorkCardDeparture(workSession).awaitingDeparture;
}
