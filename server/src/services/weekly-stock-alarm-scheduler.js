import {runWeeklyStockAlarmBatch} from './weekly-stock-alarm.js';
export function createWeeklyStockAlarmScheduler({db,work,timers={setInterval,clearInterval},intervalMs=60000,run=runWeeklyStockAlarmBatch,onError=error=>console.error('Weekly stock alarm failed:',error.message)}){
 if(!db||!work||typeof work.track!=='function'||typeof work.onStop!=='function'||!Number.isInteger(intervalMs)||intervalMs<60000)throw new TypeError('Invalid weekly alarm scheduler dependencies');
 let timer=null,inflight=null,stopped=false,cursor='';
 const sweep=()=>{
  if(stopped||work.stopping)return Promise.resolve({status:'STOPPED'});
  if(inflight)return inflight;
  const task=Promise.resolve().then(async()=>{
   const stores=await db.$queryRaw`SELECT s."id",s."companyId" FROM "Store" s WHERE s."active"=TRUE AND s."id">${cursor} AND EXISTS(SELECT 1 FROM "WeeklyStockAlarmPolicy" p WHERE p."companyId"=s."companyId" AND p."scope" IN ('COMPANY',s."id")) ORDER BY s."id" LIMIT 5`;
   if(!stores.length){cursor='';return {status:'IDLE'};}
   for(const store of stores){if(stopped||work.stopping)break;try{await run(db,{companyId:store.companyId,storeId:store.id})}catch(error){onError(error)}finally{cursor=store.id;}}
   return {status:'COMPLETE',stores:stores.length};
  });
  inflight=work.track(task);inflight.then(()=>{inflight=null},()=>{inflight=null});return inflight;
 };
 const stop=()=>{stopped=true;if(timer!==null)timers.clearInterval(timer);timer=null};work.onStop(stop);
 return {sweep,stop,start(){if(timer!==null||stopped||work.stopping)return;timer=timers.setInterval(()=>sweep().catch(onError),intervalMs);timer?.unref?.();}};
}
