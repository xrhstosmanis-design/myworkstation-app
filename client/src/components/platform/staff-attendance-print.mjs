import {printStaffReport} from '../cloud/staff-shift-report-print.mjs';
import {staffAttendanceReportHeadings,staffAttendanceReportRow} from './staff-attendance-csv.mjs';

export function printStaffAttendance(browserWindow, storeName, date, items) {
  return printStaffReport(
    browserWindow, 'Αναφορά παρουσιών', [storeName,date].filter(Boolean).join(' · '),
    staffAttendanceReportHeadings, items.map(staffAttendanceReportRow)
  );
}
