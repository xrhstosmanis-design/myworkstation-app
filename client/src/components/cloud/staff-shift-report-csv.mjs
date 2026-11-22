const dateTime = new Intl.DateTimeFormat('el-GR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Athens', hour12: false
});
const money = new Intl.NumberFormat('el-GR', {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2
});
const headings = [
  'Χειριστής', 'Ταμείο', 'Βάρδια', 'Έναρξη', 'Λήξη', 'Μετρητά POS',
  'Κάρτες POS', 'EFTPOS', 'Έξοδα', 'Αναμενόμενα μετρητά',
  'Καταμέτρηση', 'Διαφορά μετρητών', 'Διαφορά καρτών', 'Συναλλαγές'
];

export function formatShiftTimestamp(value) {
  return value && Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : '';
}

function csvText(value) {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function csvAmount(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? money.format(number) : '';
}

export function buildStaffShiftReportCsv(shifts) {
  const rows = shifts.map(shift => [
    csvText(shift.openedByName), csvText(shift.terminalPos), csvText(shift.shiftLabel),
    csvText(formatShiftTimestamp(shift.openedAt)),
    csvText(shift.status === 'OPEN' ? 'Ανοιχτή' : formatShiftTimestamp(shift.closedAt)),
    csvAmount(shift.cashSales), csvAmount(shift.cardSales),
    csvAmount(shift.status === 'CLOSED' ? shift.eftposTotal : null),
    csvAmount(shift.expenses), csvAmount(shift.expectedOperational), csvAmount(shift.actualOperational),
    csvAmount(shift.variance), csvAmount(shift.status === 'CLOSED' ? shift.cardVariance : null),
    Number.isSafeInteger(shift.transactionCount) && shift.transactionCount >= 0 ? shift.transactionCount : 0
  ]);
  return '\uFEFF' + [headings.map(csvText), ...rows].map(row => row.join(';')).join('\r\n') + '\r\n';
}
