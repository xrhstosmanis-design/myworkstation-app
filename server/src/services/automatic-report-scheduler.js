// Explicitly started, bounded and drained by the existing server shutdown work.
// No timers or database work run at import or factory construction.
export function createAutomaticReportScheduler({db,dispatcher,activationProvider,work,clock=()=>new Date().toISOString(),intervalMs=60000,batchSize=5,maxAttempts=15,timers={setInterval,clearInterval}}){
 if(!db||!dispatcher||typeof dispatcher.dispatch!=='function'||typeof activationProvider!=='function'||!work||typeof work.track!=='function'||typeof work.onStop!=='function'||!Number.isInteger(intervalMs)||intervalMs<60000||!Number.isInteger(batchSize)||batchSize<1||batchSize>20||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>60)throw new TypeError('Bounded scheduler dependencies required');
 let timer=null,inflight=null,stopped=false,cursor=null;
 const stop=()=>{stopped=true;if(timer!==null){timers.clearInterval(timer);timer=null}};
 work.onStop(stop);
 const enabled=()=>{const c=activationProvider();return c?.valid&&c.enabled?c:null};
 async function run(){
  if(stopped||work.stopping||!enabled())return {status:'OFF',attempted:0};
  const control=enabled();clock();
  // Tuple keyset gives later stores a turn. Wrap only on a later sweep.
  const rows=cursor?await db.$queryRaw`SELECT "companyId","storeId" FROM "AutomaticReportDispatchPolicy" WHERE "dispatchEnabled"=TRUE AND "reportType"='CASH' AND ("companyId","storeId")>(${cursor.companyId},${cursor.storeId}) ORDER BY "companyId","storeId" LIMIT ${batchSize}`:await db.$queryRaw`SELECT "companyId","storeId" FROM "AutomaticReportDispatchPolicy" WHERE "dispatchEnabled"=TRUE AND "reportType"='CASH' ORDER BY "companyId","storeId" LIMIT ${batchSize}`;
  if(!Array.isArray(rows)||rows.length>batchSize)throw new Error('Invalid bounded scheduler result');
  if(!rows.length){cursor=null;return {status:'COMPLETE',attempted:0}}
  let attempted=0;
  for(const row of rows){
   if(stopped||work.stopping||attempted>=maxAttempts)break;
   const latest=enabled();if(!latest||latest.fingerprint!==control.fingerprint)break;
   for(const frequency of ['DAILY','WEEKLY','MONTHLY']){
    if(stopped||work.stopping||attempted>=maxAttempts)break;
    const fresh=enabled();if(!fresh||fresh.fingerprint!==control.fingerprint)break;
    const result=await dispatcher.dispatch({companyId:row.companyId,storeId:row.storeId,frequency},{maxAttempts:Math.min(5,maxAttempts-attempted)});
    if(!Number.isInteger(result.attempted)||result.attempted<0||result.attempted>Math.min(5,maxAttempts-attempted))throw new Error('Invalid dispatcher attempt count');
    attempted+=result.attempted;
   }
   cursor={companyId:row.companyId,storeId:row.storeId};
  }
  return {status:'COMPLETE',attempted};
 }
 const sweep=()=>{
  if(inflight)return inflight;
  if(stopped||work.stopping)return Promise.resolve({status:'OFF',attempted:0});
  // Track before async admission to preserve shutdown ordering.
  const task=Promise.resolve().then(run);
  inflight=work.track(task);inflight.then(()=>{inflight=null},()=>{inflight=null});return inflight;
 };
 return Object.freeze({sweep,stop,start(){if(stopped||work.stopping||timer!==null)return;timer=timers.setInterval(()=>{sweep().catch(()=>{})},intervalMs);timer?.unref?.();}});
}
