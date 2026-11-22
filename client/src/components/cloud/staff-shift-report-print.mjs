import {formatShiftTimestamp} from './staff-shift-report-csv.mjs';

const euros = new Intl.NumberFormat('el-GR', {style:'currency', currency:'EUR'});
export const shiftTimestamp = value => formatShiftTimestamp(value) || '—';
export const shiftAmount = value => value == null || !Number.isFinite(Number(value)) ? '—' : euros.format(Number(value));

export const staffShiftReportColumns = [
  ['Χειριστής', shift => shift.openedByName || '—'],
  ['Ταμείο', shift => shift.terminalPos || '—'],
  ['Βάρδια', shift => shift.shiftLabel || '—'],
  ['Έναρξη', shift => shiftTimestamp(shift.openedAt)],
  ['Λήξη', shift => shift.status === 'OPEN' ? 'Ανοιχτή' : shiftTimestamp(shift.closedAt)],
  ['Μετρητά POS', shift => shiftAmount(shift.cashSales)],
  ['Κάρτες POS', shift => shiftAmount(shift.cardSales)],
  ['EFTPOS', shift => shiftAmount(shift.status === 'CLOSED' ? shift.eftposTotal : null)],
  ['Έξοδα', shift => shiftAmount(shift.expenses)],
  ['Αναμενόμενα μετρητά', shift => shiftAmount(shift.expectedOperational)],
  ['Καταμέτρηση', shift => shiftAmount(shift.actualOperational)],
  ['Διαφορά μετρητών', shift => shiftAmount(shift.variance)],
  ['Διαφορά καρτών', shift => shiftAmount(shift.status === 'CLOSED' ? shift.cardVariance : null)],
  ['Συναλλαγές', shift => shift.transactionCount ?? 0]
];

export function printStaffShiftReport(browserWindow, storeName, shifts) {
  const headings = staffShiftReportColumns.map(([label]) => label);
  const rows = shifts.map(shift => staffShiftReportColumns.map(([, read]) => read(shift)));
  return printStaffReport(browserWindow, 'Αναφορά βαρδιών', storeName, headings, rows);
}

export function printStaffReport(browserWindow, title, subtitle, headings, rows) {
  const printWindow = browserWindow.open('', '_blank');
  if (!printWindow) return false;

  try {
    printWindow.opener = null;
    const doc = printWindow.document;
    const element = (tag, value) => {
      const node = doc.createElement(tag);
      if (value !== undefined) node.textContent = String(value);
      return node;
    };
    doc.title = title;
    doc.documentElement.lang = 'el';
    doc.head.append(element('style', `
      @page { size: A4 landscape; margin: 10mm; }
      body { font: 10pt system-ui, sans-serif; }
      table { width: 100%; border-collapse: collapse; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      th, td { padding: 3px; border: 1px solid #b5bcc4; text-align: left; overflow-wrap: anywhere; }
    `));

    const table = element('table');
    const thead = element('thead');
    const header = element('tr');
    for (const label of headings) {
      const cell = element('th', label);
      cell.scope = 'col';
      header.append(cell);
    }
    thead.append(header);
    const tbody = element('tbody');
    for (const values of rows) {
      const row = element('tr');
      for (const value of values) row.append(element('td', value ?? '—'));
      tbody.append(row);
    }
    table.append(thead, tbody);

    doc.body.append(element('h1', title), element('p', subtitle), table);
    printWindow.addEventListener('afterprint', () => printWindow.close(), {once:true});
    printWindow.focus();
    printWindow.print();
    return true;
  } catch {
    printWindow.close();
    return false;
  }
}
