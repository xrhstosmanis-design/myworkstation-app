const fail=code=>{throw Object.assign(new Error(code),{code})};
const canonicalDate=value=>{
 if(typeof value!=='string'||value.length!==24||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))fail('SNAPSHOT_OBSERVATION_INVALID');
 const date=new Date(value);if(!Number.isFinite(date.getTime())||date.toISOString()!==value)fail('SNAPSHOT_OBSERVATION_INVALID');return date;
};
const wallParts=date=>Object.fromEntries(new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));

export function monthlyInventorySnapshotPeriod(issueMonth){
 if(typeof issueMonth!=='string'||issueMonth.length!==7||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(issueMonth))fail('SNAPSHOT_MONTH_INVALID');
 const year=Number(issueMonth.slice(0,4)),month=Number(issueMonth.slice(5)),next=new Date(Date.UTC(year,month,1)),day=next.toISOString().slice(0,10);
 const target=Date.parse(day+'T07:00:00.000Z');let instant=target;
 for(let n=0;n<4;n++){const p=wallParts(new Date(instant));instant+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)}
 const p=wallParts(new Date(instant));if(`${p.year}-${p.month}-${p.day}`!==day||p.hour!=='07'||p.minute!=='00')fail('SNAPSHOT_ATHENS_TIME_UNAVAILABLE');
 return Object.freeze({issueMonth,issueFromDay:issueMonth+'-01',issueToDayExclusive:day,scheduledFor:new Date(instant).toISOString(),scheduledLocalTime:day+' 07:00',timeZone:'Europe/Athens'});
}

export function classifyMonthlyInventoryObservation(issueMonth,sourceObservedAt){
 const period=monthlyInventorySnapshotPeriod(issueMonth),date=canonicalDate(sourceObservedAt),delayMs=date.getTime()-Date.parse(period.scheduledFor);
 if(delayMs<0)fail('SNAPSHOT_BEFORE_DUE');
 return Object.freeze({...period,sourceObservedAt:date.toISOString(),timing:delayMs===0?'ON_TIME':'LATE',delayMs});
}
