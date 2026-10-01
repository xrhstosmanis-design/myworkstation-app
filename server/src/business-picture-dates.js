const zone='Europe/Athens';
const bad=()=>Object.assign(new Error('Επίλεξε έγκυρες ημερομηνίες από και έως (2000–2100).'),{status:400});
function parseDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw bad();
 const [y,m,d]=value.split('-').map(Number),stamp=Date.UTC(y,m-1,d);
 if(y<2000||y>2100||new Date(stamp).toISOString().slice(0,10)!==value)throw bad();
 return stamp;
}
function midnight(stamp){
 let instant=stamp;
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(fmt.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
  instant+=stamp-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
 }
 return instant;
}
export function businessPictureCalendarRange(calendarFrom,calendarTo){
 const start=parseDay(calendarFrom),end=parseDay(calendarTo);
 if(start>end)throw bad();
 return {from:new Date(midnight(start)),to:new Date(midnight(end+86400000)-1),calendarFrom,calendarTo,timeZone:zone};
}
