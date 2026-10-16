// Calendar reporting by shift closing date. Business-day dispatch has its own
// explicit saved schedule; never silently substitute one boundary for the other.
export function cashReportPeriod({period="DAY",date,from,to}={}) {
  const parse=value=>{
    if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Επίλεξε έγκυρη ημερομηνία.");
    const stamp=Date.parse(value+"T12:00:00Z");
    if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==value||value<"2000-01-01"||value>"2100-12-31")throw new Error("Επίλεξε έγκυρη ημερομηνία (2000–2100).");
    return stamp;
  };
  const day=stamp=>new Date(stamp).toISOString().slice(0,10);
  if(!["DAY","WEEK","MONTH","CUSTOM","SHIFT"].includes(period))throw new Error("Μη έγκυρη περίοδος ελέγχου.");
  if(period==="CUSTOM"){
    const first=parse(from),last=parse(to);
    if(first>last)throw new Error("Η ημερομηνία Από πρέπει να προηγείται της Έως.");
    if((last-first)/86400000>=366)throw new Error("Επίλεξε διάστημα έως 366 ημέρες.");
  }else{
    const stamp=parse(date),d=new Date(stamp);
    from=to=date;
    if(period==="WEEK"){from=day(stamp-((d.getUTCDay()+6)%7)*86400000);to=day(Date.parse(from+"T12:00:00Z")+6*86400000);}
    if(period==="MONTH"){from=date.slice(0,7)+"-01";to=day(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12));}
    parse(from);parse(to);
  }
  return {period,from,to,timeZone:"Europe/Athens",dateBasis:"SHIFT_CLOSED_CALENDAR_DAY"};
}

export function cashReportRowDay(value){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
}
