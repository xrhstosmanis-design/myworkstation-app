import {businessPictureCalendarRange} from "../business-picture-dates.js";

const zone="Europe/Athens";
const parts=date=>Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));
const fail=message=>{throw Object.assign(new Error(message),{status:400})};
const knownAmount=value=>value!==null&&value!==undefined&&typeof value!=="boolean"&&String(value).trim()!==""&&Number.isFinite(Number(value));
export function reportDayOffset(day,offset){
  businessPictureCalendarRange(day,day);
  if(!Number.isInteger(offset)||Math.abs(offset)>366)fail("Μη έγκυρη μετατόπιση ημέρας αναφοράς.");
  return new Date(Date.parse(day+"T12:00:00Z")+offset*86400000).toISOString().slice(0,10);
}
export function reportWallTime(day,hour){
  businessPictureCalendarRange(day,day);
  // Day boundaries are explicitly chosen outside Greece's ambiguous DST hours.
  if(!Number.isInteger(hour)||hour<5||hour>12)fail("Η αλλαγή επιχειρησιακής ημέρας πρέπει να είναι μεταξύ 05:00 και 12:00.");
  const target=Date.parse(day+"T00:00:00Z")+hour*3600000;
  let instant=target;
  for(let i=0;i<4;i++){
    const p=parts(new Date(instant));
    instant+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  }
  const p=parts(new Date(instant));
  if(`${p.year}-${p.month}-${p.day}`!==day||+p.hour!==hour||+p.minute!==0)fail("Δεν προσδιορίστηκε η ώρα Ελλάδας της αναφοράς.");
  return new Date(instant);
}
export function reportBusinessPeriod(fromDay,toDay,{dayStartHour=7}={}){
  businessPictureCalendarRange(fromDay,toDay);
  const days=Math.round((Date.parse(toDay+"T12:00:00Z")-Date.parse(fromDay+"T12:00:00Z"))/86400000)+1;
  if(days>366)fail("Επίλεξε διάστημα έως366 ημέρες.");
  return {from:reportWallTime(fromDay,dayStartHour),to:reportWallTime(reportDayOffset(toDay,1),dayStartHour),fromDay,toDay,dayStartHour,timeZone:zone,endExclusive:true};
}
export function completedReportPeriod(now,frequency,{dayStartHour=7}={}){
  if(!["DAILY","WEEKLY","MONTHLY"].includes(frequency)||!Number.isFinite(new Date(now).getTime()))fail("Μη έγκυρη περίοδος αναφοράς.");
  const p=parts(new Date(now)),calendarDay=`${p.year}-${p.month}-${p.day}`;
  const activeDay=+p.hour<dayStartHour?reportDayOffset(calendarDay,-1):calendarDay;
  let fromDay,toDay;
  if(frequency==="DAILY")fromDay=toDay=reportDayOffset(activeDay,-1);
  if(frequency==="WEEKLY"){
    const dow=(new Date(activeDay+"T12:00:00Z").getUTCDay()+6)%7;
    toDay=reportDayOffset(activeDay,-dow-1);fromDay=reportDayOffset(toDay,-6);
  }
  if(frequency==="MONTHLY"){
    toDay=reportDayOffset(activeDay.slice(0,7)+"-01",-1);fromDay=toDay.slice(0,7)+"-01";
  }
  return {frequency,...reportBusinessPeriod(fromDay,toDay,{dayStartHour})};
}

// No financial posting, employee liability transfer or speculative matching.
// Caller supplies ALL source sessions for the declared business day, plus an
// explicit per-store list of expected terminals. Missing/ambiguous data holds
// delivery. Merely seeing three closed rows is never sufficient.
export function dailyCashReportReadiness(sessions,{companyId,storeId,day,dayStartHour=7,secondShiftStartHour=15,thirdShiftStartHour=23,terminals=[]},now=new Date()){
  const period=reportBusinessPeriod(day,day,{dayStartHour}),holds=[];
  now=new Date(now);if(!Number.isFinite(now.getTime()))fail("Μη έγκυρη ώρα ελέγχου.");
  if(!companyId||!storeId)fail("Απαιτείται συγκεκριμένη εταιρεία και κατάστημα.");
  if(!Number.isInteger(secondShiftStartHour)||!Number.isInteger(thirdShiftStartHour)||secondShiftStartHour<=dayStartHour||thirdShiftStartHour<=secondShiftStartHour||thirdShiftStartHour>23)fail("Επίλεξε τις ώρες έναρξης δεύτερης και τρίτης βάρδιας.");
  if(!Array.isArray(sessions)||!Array.isArray(terminals)||terminals.length>100)fail("Μη έγκυρη λίστα βαρδιών ή τερματικών.");
  const policies=terminals.map(value=>typeof value==="string"?{terminalPos:value.trim(),requiredSlots:[1,2,3]}:value);
  if(policies.some(p=>!p||typeof p.terminalPos!=="string"||!p.terminalPos.trim()||p.terminalPos!==p.terminalPos.trim()||p.terminalPos.length>120||!Array.isArray(p.requiredSlots)||!p.requiredSlots.length||p.requiredSlots.some(slot=>![1,2,3].includes(slot))||new Set(p.requiredSlots).size!==p.requiredSlots.length))fail("Μη έγκυρος κανόνας βαρδιών τερματικού.");
  const expected=policies.map(p=>p.terminalPos);
  if(new Set(expected).size!==expected.length)fail("Διπλός κανόνας τερματικού.");
  if(!expected.length)holds.push({code:"TERMINALS_NOT_CONFIGURED"});
  if(!policies.some(p=>p.requiredSlots.includes(3)))holds.push({code:"THIRD_SHIFT_NOT_CONFIGURED"});
  if(new Date(now)<period.to)holds.push({code:"BUSINESS_DAY_NOT_FINISHED"});
  const seen=new Set(),accepted=[];
  for(const row of sessions){
    const at=new Date(row.openedAt),closed=row.closedAt?new Date(row.closedAt):null;
    if(row.companyId!==companyId||row.storeId!==storeId||!row.id||seen.has(row.id)||!Number.isFinite(at.getTime())||at<period.from||at>=period.to){holds.push({code:"SOURCE_SCOPE_OR_ID_INVALID"});continue;}
    seen.add(row.id);accepted.push(row);
    if(!expected.includes(row.terminalPos))holds.push({code:"UNCONFIGURED_TERMINAL",terminalPos:row.terminalPos});
    if(row.status!=="CLOSED"||!closed||!Number.isFinite(closed.getTime())||closed<at||closed>now)holds.push({code:"SHIFT_NOT_CLOSED",sessionId:row.id});
    if(!knownAmount(row.variance))holds.push({code:"SHIFT_VARIANCE_UNKNOWN",sessionId:row.id});
  }
  for(const terminalPos of expected){
    const rows=accepted.filter(row=>row.terminalPos===terminalPos);
    const required=policies.find(p=>p.terminalPos===terminalPos).requiredSlots;
    if(rows.length<new Set(required).size)holds.push({code:"MISSING_SHIFTS",terminalPos});
    for(const [slot,start,end] of [[1,dayStartHour,secondShiftStartHour],[2,secondShiftStartHour,thirdShiftStartHour]]){
      if(required.includes(slot)&&!rows.some(row=>{const hour=+parts(new Date(row.openedAt)).hour;return hour>=start&&hour<end;}))holds.push({code:"SHIFT_SLOT_MISSING",terminalPos,slot});
    }
    const third=rows.filter(row=>{const hour=+parts(new Date(row.openedAt)).hour;return hour>=thirdShiftStartHour||hour<dayStartHour;});
    if(required.includes(3)&&!third.length)holds.push({code:"THIRD_SHIFT_MISSING",terminalPos});
    if(third.some(row=>row.status!=="CLOSED"))holds.push({code:"THIRD_SHIFT_OPEN",terminalPos});
  }
  return {ready:holds.length===0,holds,period,sessionIds:accepted.map(row=>row.id)};
}

export function summarizeCashVariances(rows,{dayStartHour=7}={}){
  const groups=new Map(),seen=new Set();
  for(const row of rows){
    if(row.status!=="CLOSED"||!row.companyId||!row.storeId||!row.terminalPos||!["STORE","DELIVERY"].includes(row.cashChain)||!Number.isFinite(new Date(row.openedAt).getTime())||!knownAmount(row.variance))fail("Η βάρδια δεν έχει οριστική καταγεγραμμένη διαφορά και αλυσίδα ταμείου.");
    if(!row.id||seen.has(row.id))fail("Διπλή ή άγνωστη ταυτότητα βάρδιας.");seen.add(row.id);
    const p=parts(new Date(row.openedAt)),calendarDay=`${p.year}-${p.month}-${p.day}`,day=+p.hour<dayStartHour?reportDayOffset(calendarDay,-1):calendarDay;
    reportWallTime(day,dayStartHour);
    const key=JSON.stringify([row.companyId,row.storeId,row.terminalPos,row.cashChain,day]);
    const group=groups.get(key)||{companyId:row.companyId,storeId:row.storeId,terminalPos:row.terminalPos,cashChain:row.cashChain,day,originalShortageCents:0,originalSurplusCents:0,rows:[],ids:new Set()};
    if(!row.id||group.ids.has(row.id))fail("Διπλή ή άγνωστη ταυτότητα βάρδιας.");group.ids.add(row.id);
    const cents=Math.round(Number(row.variance)*100);
    if(!Number.isSafeInteger(cents))fail("Μη έγκυρη διαφορά ταμείου.");
    group.originalShortageCents+=Math.max(0,-cents);group.originalSurplusCents+=Math.max(0,cents);
    if(!Number.isSafeInteger(group.originalShortageCents)||!Number.isSafeInteger(group.originalSurplusCents))fail("Το σύνολο υπερβαίνει την ακρίβεια της αναφοράς.");
    group.rows.push({sessionId:row.id,employeeId:row.openedBy,employeeName:row.openedByName,variance:cents/100});groups.set(key,group);
  }
  return [...groups.values()].map(({ids,originalShortageCents,originalSurplusCents,...group})=>({...group,originalShortage:originalShortageCents/100,originalSurplus:originalSurplusCents/100,offset:Math.min(originalShortageCents,originalSurplusCents)/100,netVariance:(originalSurplusCents-originalShortageCents)/100,employeeLiabilityAdjusted:false}));
}
