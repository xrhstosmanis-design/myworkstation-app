// Explicit, default-OFF runner. Import/construction never queries or starts a
// timer; every real job phase still performs its own current authorization.
import {readCurrentMonthlyCaptureActivation} from './monthly-inventory-capture-activation.js';

const off=()=>Object.freeze({status:'OFF',attempted:0,visited:0});
const text=value=>typeof value==='string'&&value.length>0&&value.trim()===value&&Buffer.byteLength(value,'utf8')<=160&&!/[\u0000-\u001f\u007f]/.test(value);
function rowsCopy(rows,limit){
 if(!Array.isArray(rows)||rows.length>limit)throw new Error('Invalid bounded monthly capture grant scan');
 const seen=new Set();
 return rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Invalid monthly capture grant cursor');
  const descriptors=Object.getOwnPropertyDescriptors(row),keys=['id','companyId','storeId'];
  if(Reflect.ownKeys(descriptors).some(key=>typeof key!=='string'||!keys.includes(key)||!('value' in descriptors[key]))||keys.some(key=>!descriptors[key]))throw new Error('Invalid monthly capture grant cursor');
  const copy=Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
  if(keys.some(key=>!text(copy[key])))throw new Error('Invalid monthly capture grant cursor');
  const tuple=JSON.stringify([copy.companyId,copy.storeId,copy.id]);
  if(seen.has(tuple))throw new Error('Duplicate monthly capture grant cursor');
  seen.add(tuple);return Object.freeze(copy);
 });
}

export function createMonthlyInventoryCaptureScheduler({jobs,work,intervalMs=60000,batchSize=5,maxAttempts=5,maxSweepMs=60000,timers={setInterval,clearInterval},monotonicNow=()=>performance.now()}){
 if(!jobs||typeof jobs.scanEligibleGrants!=='function'||typeof jobs.runGrant!=='function'||!work||typeof work.track!=='function'||typeof work.onStop!=='function'||!Number.isInteger(intervalMs)||intervalMs<60000||intervalMs>3600000||!Number.isInteger(batchSize)||batchSize<1||batchSize>20||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>60||!Number.isInteger(maxSweepMs)||maxSweepMs<1||maxSweepMs>300000||!timers||typeof timers.setInterval!=='function'||typeof timers.clearInterval!=='function'||typeof monotonicNow!=='function')throw new TypeError('Bounded monthly capture scheduler dependencies required');
 let timer=null,inflight=null,stopped=false,initialized=false,dormant=false,fingerprint=null,cursor=null;
 const clear=()=>{if(timer!==null){timers.clearInterval(timer);timer=null}};
 const stop=()=>{stopped=true;clear()};
 work.onStop(stop);
 function enabled(){
  if(stopped||work.stopping||dormant)return null;
  const control=readCurrentMonthlyCaptureActivation();
  if(!initialized){initialized=true;if(control.valid&&control.enabled)fingerprint=control.fingerprint;else dormant=true;}
  if(dormant||!control.valid||!control.enabled||control.fingerprint!==fingerprint){dormant=true;clear();return null;}
  return control;
 }
 const elapsed=(start,last)=>{
  const now=monotonicNow();
  if(!Number.isFinite(now)||now<start||now<last)throw new Error('Invalid monthly capture sweep budget clock');
  return now;
 };
 async function run(){
  if(!enabled())return off();
  const start=monotonicNow();if(!Number.isFinite(start)||start<0)throw new Error('Invalid monthly capture sweep budget clock');
  let last=start,attempted=0,visited=0;
  const rows=rowsCopy(await jobs.scanEligibleGrants({after:cursor,limit:batchSize}),batchSize);
  if(!enabled())return off();
  if(!rows.length){cursor=null;return Object.freeze({status:'COMPLETE',attempted,visited})}
  for(const row of rows){
   if(!enabled()||attempted>=maxAttempts)break;
   last=elapsed(start,last);if(last-start>=maxSweepMs)break;
   // Advancing even on a rejected/failed store prevents it starving later
   // stores on the next bounded sweep. No database authority comes from it.
   try{
    const result=await jobs.runGrant(row.id);
    if(!result||!Number.isInteger(result.attempted)||result.attempted<0||result.attempted>1||typeof result.status!=='string')throw new Error('Invalid monthly capture job result');
    attempted+=result.attempted;
   }finally{cursor=Object.freeze({companyId:row.companyId,storeId:row.storeId,id:row.id});visited++;}
   if(!enabled())break;
  }
  return Object.freeze({status:'COMPLETE',attempted,visited});
 }
 const sweep=()=>{
  if(inflight)return inflight;
  if(stopped||work.stopping||dormant)return Promise.resolve(off());
  // Register the pending task before asynchronous admission, preserving the
  // existing shutdown coordinator's stop-then-drain ordering.
  const task=Promise.resolve().then(run);
  inflight=work.track(task);
  inflight.then(()=>{inflight=null},()=>{inflight=null});return inflight;
 };
 return Object.freeze({sweep,stop,start(){if(timer!==null||!enabled())return;timer=timers.setInterval(()=>{sweep().catch(()=>{})},intervalMs);timer?.unref?.();}});
}
