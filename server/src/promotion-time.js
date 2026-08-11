const ATHENS_TZ="Europe/Athens";

const partsFormatter=new Intl.DateTimeFormat("en-GB",{
  timeZone:ATHENS_TZ,
  year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
});

function partsAt(epoch){
  const parts=Object.fromEntries(partsFormatter.formatToParts(new Date(epoch)).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second)};
}

export function parsePromotionDate(value){
  if(value===null||value===undefined||value==="")return value;
  if(value instanceof Date)return value;
  const text=String(value).trim();
  if(/[zZ]$|[+-]\d\d:\d\d$/.test(text))return new Date(text);
  const match=text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!match)return new Date(text);
  const desired={year:+match[1],month:+match[2],day:+match[3],hour:+match[4],minute:+match[5],second:+(match[6]||0)};
  const desiredAsUtc=Date.UTC(desired.year,desired.month-1,desired.day,desired.hour,desired.minute,desired.second);
  let epoch=desiredAsUtc;
  for(let i=0;i<3;i++){
    const observed=partsAt(epoch);
    const observedAsUtc=Date.UTC(observed.year,observed.month-1,observed.day,observed.hour,observed.minute,observed.second);
    epoch+=desiredAsUtc-observedAsUtc;
  }
  return new Date(epoch);
}

export function normalizePromotionDateBody(body={}){
  const next={...body};
  for(const key of ["validFrom","validUntil"]){
    if(next[key]===undefined||next[key]===null||next[key]==="")continue;
    const parsed=parsePromotionDate(next[key]);
    if(parsed instanceof Date&&!Number.isNaN(parsed.getTime()))next[key]=parsed.toISOString();
  }
  return next;
}
