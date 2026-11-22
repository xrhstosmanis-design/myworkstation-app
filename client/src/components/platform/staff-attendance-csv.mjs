import {formatShiftTimestamp} from '../cloud/staff-shift-report-csv.mjs';

const statuses = new Map([
  ['OPEN', 'Σε εξέλιξη'],
  ['NEEDS_APPROVAL', 'Χρειάζεται έγκριση'],
  ['NEEDS_REVIEW', 'Χρειάζεται έλεγχο'],
  ['APPROVED', 'Εγκρίθηκε']
]);

export function attendanceStatusLabel(status) {
  return statuses.get(status) ?? 'Ολοκληρωμένη';
}

function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export const staffAttendanceReportHeadings = [
  'Εργαζόμενος', 'Βάρδια', 'Έναρξη', 'Λήξη', 'Προγραμματισμένα λεπτά',
  'Πραγματικά λεπτά', 'Απόκλιση σε λεπτά', 'Κατάσταση'
];

export function staffAttendanceReportRow(item) {
  const shift = item.assignment?.shiftTemplate;
  return [
    item.employee.fullName,
    shift ? `${shift.name} · ${shift.startTime}–${shift.endTime}` : 'Χωρίς δημοσιευμένη βάρδια',
    formatShiftTimestamp(item.startedAt), formatShiftTimestamp(item.endedAt),
    item.scheduledMinutes, item.workedMinutes, item.varianceMinutes, attendanceStatusLabel(item.status)
  ];
}

export function buildStaffAttendanceCsv(date, items) {
  const rows = [
    ['Ημερομηνία αναφοράς', ...staffAttendanceReportHeadings],
    ...items.map(item => [date, ...staffAttendanceReportRow(item)])
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
