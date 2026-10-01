export function businessPictureToday(now=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function businessPicturePreset(kind='DEFAULT',now=new Date()){
 const today=businessPictureToday(now),[year,month]=today.split('-').map(Number);
 const day=(y,m,d)=>new Date(Date.UTC(y,m,d)).toISOString().slice(0,10);
 if(kind==='PREVIOUS_QUARTER'){
  const quarterStart=Math.floor((month-1)/3)*3;
  return {from:day(year,quarterStart-3,1),to:day(year,quarterStart,0)};
 }
 return {from:day(year,month-1-(kind==='CURRENT_MONTH'?0:2),1),to:today};
}
