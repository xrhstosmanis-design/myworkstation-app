import {cashReportPeriod} from "../../../client/src/lib/cash-report-period.js";
export function resolveCashReportPeriod(query={},today){
  try{
    const period=String(query.period||(query.from||query.to?"CUSTOM":"DAY"));
    const range=cashReportPeriod({period,date:String(query.date||today),from:query.from,to:query.to});
    if(period==="SHIFT"&&!String(query.sessionId||"").trim())throw new Error("Επίλεξε συγκεκριμένη βάρδια.");
    return {...range,sessionId:query.sessionId?String(query.sessionId):null};
  }catch(error){error.status=400;throw error;}
}

// A month can contain hundreds of shifts. Each investigation reads several
// sources; do not enqueue all of them on the production connection pool at once.
export async function mapCashReportRows(rows,inspect){
  const results=new Array(rows.length);let next=0;
  const worker=async()=>{while(next<rows.length){const index=next++;results[index]=await inspect(rows[index],index);}};
  await Promise.all(Array.from({length:Math.min(2,rows.length)},()=>worker()));
  return results;
}
