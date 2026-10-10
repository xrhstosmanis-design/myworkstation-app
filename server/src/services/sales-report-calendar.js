import {businessPictureCalendarRange} from "../business-picture-dates.js";

// Opt-in Greek calendar bounds. The existing no-timeZone report path stays intact.
export function salesReportCalendar(from,to){
  const range=businessPictureCalendarRange(from,to);
  const days=(Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000+1;
  if(days>366)throw Object.assign(new Error("Επίλεξε διάστημα έως 366 ημέρες."),{status:400});
  return {...range,to:new Date(range.to.getTime()+1)};
}
export function optionalSalesCalendar(query){
  if(query.timeZone===undefined)return null;
  if(query.timeZone!=="Europe/Athens")throw Object.assign(new Error("Μη έγκυρη ζώνη ώρας αναφοράς."),{status:400});
  return salesReportCalendar(query.from,query.to);
}
