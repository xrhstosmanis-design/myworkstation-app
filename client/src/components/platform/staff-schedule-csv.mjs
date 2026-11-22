export const staffScheduleReportHeadings=['Ημερομηνία','Εργαζόμενος','Βάρδια','Έναρξη','Λήξη','Θέση'];

export function staffScheduleReportRow(assignment){
  const shift=assignment.shiftTemplate;
  return [assignment.date,assignment.employee?.fullName??'Ακάλυπτο',
    shift.name,shift.startTime,shift.endTime,assignment.slot];
}

export function buildStaffScheduleCsv(assignments){
  const rows=[staffScheduleReportHeadings,...assignments.map(staffScheduleReportRow)];
  return '\uFEFF'+rows.map(row=>row.map(value=>{
    const text=String(value??'');
    const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(text)?"'"+text:text;
    return '"'+safe.replaceAll('"','""')+'"';
  }).join(';')).join('\r\n')+'\r\n';
}
