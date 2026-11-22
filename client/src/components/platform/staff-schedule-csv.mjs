export function buildStaffScheduleCsv(assignments){
  const rows=[['Ημερομηνία','Εργαζόμενος','Βάρδια','Έναρξη','Λήξη','Θέση']];
  for(const assignment of assignments){
    const shift=assignment.shiftTemplate;
    rows.push([assignment.date,assignment.employee?.fullName??'Ακάλυπτο',
      shift.name,shift.startTime,shift.endTime,assignment.slot]);
  }
  return '\uFEFF'+rows.map(row=>row.map(value=>{
    const text=String(value??'');
    const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(text)?"'"+text:text;
    return '"'+safe.replaceAll('"','""')+'"';
  }).join(';')).join('\r\n')+'\r\n';
}
