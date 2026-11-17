// Explicitly started, bounded and drained by the existing server shutdown work.
// No timers or database work run at import or factory construction.
export function createAutomaticReportScheduler({db,dispatcher,reportType='CASH',activationProvider,work,clock=()=>new Date().toISOString(),intervalMs=60000,batchSize=5,maxAttempts=15,timers={setInterval,clearInterval},readPromotionEvents} ){
 if(!db||!dispatcher||typeof dispatcher.dispatch!=='function'||typeof activationProvider!=='function'||!work||typeof work.track!=='function'||typeof work.onStop!=='function'||!Number.isInteger(intervalMs)||intervalMs<60000||!Number.isInteger(batchSize)||batchSize<1||batchSize>20||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>60)throw new TypeError('Bounded scheduler dependencies required');
 const frequencies={CASH:['DAILY','WEEKLY','MONTHLY'],SUPPLIER_COMPARISON:['MONTHLY'],PROMOTION_RESULT:['EVENT']};
 if(!Object.hasOwn(frequencies,reportType))throw new TypeError('Unsupported scheduled report type');
 let timer=null,inflight=null,stopped=false,cursor=null;
 const eventCursors=new Map();
 const stop=()=>{stopped=true;if(timer!==null){timers.clearInterval(timer);timer=null}};
 work.onStop(stop);
 const enabled=()=>{const c=activationProvider();return c?.valid&&c.enabled?c:null};
 async function run(){
  if(stopped||work.stopping||!enabled())return {status:'OFF',attempted:0};
  const control=enabled();clock();
  // Tuple keyset gives later stores a turn. Wrap only on a later sweep.
  const rows=cursor?await db.$queryRaw`SELECT "companyId","storeId" FROM "AutomaticReportDispatchPolicy" WHERE "dispatchEnabled"=TRUE AND "reportType"=${reportType} AND ("companyId","storeId")>(${cursor.companyId},${cursor.storeId}) ORDER BY "companyId","storeId" LIMIT ${batchSize}`:await db.$queryRaw`SELECT "companyId","storeId" FROM "AutomaticReportDispatchPolicy" WHERE "dispatchEnabled"=TRUE AND "reportType"=${reportType} ORDER BY "companyId","storeId" LIMIT ${batchSize}`;
  if(!Array.isArray(rows)||rows.length>batchSize)throw new Error('Invalid bounded scheduler result');
  if(!rows.length){cursor=null;return {status:'COMPLETE',attempted:0}}
  let attempted=0;
  for(const row of rows){
   if(stopped||work.stopping||attempted>=maxAttempts)break;
   const latest=enabled();if(!latest||latest.fingerprint!==control.fingerprint)break;
   const eventKey=JSON.stringify([row.companyId,row.storeId]);
   let scopes=frequencies[reportType].map(frequency=>({...row,frequency}));
   if(reportType==='PROMOTION_RESULT'){
    const reader=readPromotionEvents??(await import('./promotion-result-email.js')).listDuePromotionResultEvents;
    const events=await reader(db,{...row,now:clock(),limit:5,afterEventId:eventCursors.get(eventKey)||''});
    if(!Array.isArray(events)||events.length>5)throw new Error('Invalid bounded promotion events');
    scopes=events.map(event=>({...row,frequency:'EVENT',eventId:event.eventId}));
    if(events.length===0)eventCursors.delete(eventKey);
   }
   for(const scope of scopes){
    if(stopped||work.stopping||attempted>=maxAttempts)break;
    const fresh=enabled();if(!fresh||fresh.fingerprint!==control.fingerprint)break;
    const result=await dispatcher.dispatch(scope,{maxAttempts:Math.min(5,maxAttempts-attempted)});
    if(!Number.isInteger(result.attempted)||result.attempted<0||result.attempted>Math.min(5,maxAttempts-attempted))throw new Error('Invalid dispatcher attempt count');
    attempted+=result.attempted;
    if(reportType==='PROMOTION_RESULT'){
     eventCursors.delete(eventKey);eventCursors.set(eventKey,scope.eventId);
     if(eventCursors.size>1000)eventCursors.delete(eventCursors.keys().next().value);
    }
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
