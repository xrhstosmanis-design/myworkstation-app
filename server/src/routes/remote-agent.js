import {Router} from 'express';
import {createRemoteTrialGate} from '../lib/remote-agent-trial.js';
import crypto from 'node:crypto';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {createRemoteSessionStore,validateRemoteInput} from '../lib/remote-agent-session.js';
const trial=createRemoteTrialGate(process.env);
const router=Router(),sessions=createRemoteSessionStore({onExpire:s=>{end(s,'REMOTE_AGENT_EXPIRED').catch(()=>console.error('Remote session expiry audit failed'));}}),attempts=new Map();
const gate=(req,res,next)=>trial.enabled()?next():res.status(503).json({error:'Το Windows Remote Assist δεν έχει ενεργοποιηθεί για δοκιμή.'});
router.use(gate,(req,res,next)=>{res.set('Cache-Control','no-store');next();});
const rate=(req,res,next)=>{const key=req.ip||'unknown',time=Date.now();let a=attempts.get(key);if(!a||a.until<time){a={count:0,until:time+60_000};attempts.set(key,a);}if(++a.count>5)return res.status(429).json({error:'Περιμένετε ένα λεπτό πριν από νέα προσπάθεια.'});if(attempts.size>1000)for(const[k,v]of attempts)if(v.until<time)attempts.delete(k);next();};
const audit=async(job,event)=>prisma.authAudit.create({data:{userId:job.createdBy,event,email:'remote-assist',success:true,deviceName:job.terminalId}});
const end=async (s,event='REMOTE_AGENT_STOP')=>{sessions.stop(s.id);await prisma.$executeRaw`UPDATE "DeviceDeploymentJob" SET "status"='COMPLETED',"completedAt"=NOW(),"resultJson"='{"attendedAgent":true,"stopped":true}'::jsonb WHERE "id"=${s.id} AND "status"='DEVICE_ACCEPTED'`;await audit(s,event);};
const sweepTimer=setInterval(()=>sessions.sweep(),5000);sweepTimer.unref();
router.post('/pair',rate,async(req,res,next)=>{try{
 const b=req.body||{};if(typeof b.jobId!=='string'||b.jobId.length>100||typeof b.terminalId!=='string'||b.terminalId.length>100||!/^\d{6}$/.test(b.code||'')||b.localConsent!==true)return res.status(400).json({error:'Απαιτούνται στοιχεία συνεδρίας και τοπική αποδοχή.'});
 if(!trial.acceptsTerminal(b.terminalId))return res.status(403).json({error:'Η δοκιμή επιτρέπεται μόνο στο εγκεκριμένο laptop.'});
 if(!sessions.canStart())return res.status(503).json({error:'Δεν υπάρχει διαθέσιμη συνεδρία.'});
 const digest=crypto.createHash('sha256').update(b.code).digest('hex');
 const jobs=await prisma.$queryRaw`UPDATE "DeviceDeploymentJob" j SET "status"='DEVICE_ACCEPTED',"startedAt"=NOW(),"resultJson"='{"attendedAgent":true,"localConsent":true}'::jsonb FROM "StoreInstallationTerminal" t,"Store" s WHERE j."id"=${b.jobId} AND j."terminalId"=${b.terminalId} AND j."jobType"='REMOTE_ASSIST' AND j."status"='AWAITING_DEVICE' AND j."payloadJson"->>'supportCodeHash'=${digest} AND (j."payloadJson"->>'expiresAt')::timestamptz>NOW() AND t."id"=j."terminalId" AND t."companyId"=j."companyId" AND t."storeId"=j."storeId" AND t."active"=true AND s."id"=j."storeId" AND s."companyId"=j."companyId" AND s."active"=true RETURNING j."id",j."createdBy",j."companyId",j."storeId",j."terminalId"`;
 if(!jobs[0])return res.status(404).json({error:'Λάθος, ληγμένος ή ήδη χρησιμοποιημένος κωδικός.'});
 const connection=sessions.start(jobs[0]);await audit(jobs[0],'REMOTE_AGENT_LOCAL_CONSENT');res.status(201).json(connection);
}catch(e){next(e)}});
// Code-only pairing stays scoped to the configured trial terminal; never search other stores.
router.post('/pair-code',rate,async(req,res,next)=>{try{
 const b=req.body||{};
 if(typeof b.code!=='string'||!/^\d{6}$/.test(b.code)||b.localConsent!==true)return res.status(400).json({error:'Απαιτείται εξαψήφιος κωδικός και τοπική αποδοχή.'});
 if(!sessions.canStart())return res.status(503).json({error:'Δεν υπάρχει διαθέσιμη συνεδρία.'});
 const digest=crypto.createHash('sha256').update(b.code).digest('hex');
 const jobs=await prisma.$queryRaw`WITH candidates AS MATERIALIZED (
  SELECT j."id" FROM "DeviceDeploymentJob" j
  JOIN "StoreInstallationTerminal" t ON t."id"=j."terminalId" AND t."companyId"=j."companyId" AND t."storeId"=j."storeId" AND t."active"=true
  JOIN "Store" s ON s."id"=j."storeId" AND s."companyId"=j."companyId" AND s."active"=true
  WHERE j."terminalId"=${trial.terminalId} AND j."jobType"='REMOTE_ASSIST' AND j."status"='AWAITING_DEVICE'
   AND j."payloadJson"->>'supportCodeHash'=${digest} AND (j."payloadJson"->>'expiresAt')::timestamptz>NOW()
  LIMIT 2
 ), unique_candidate AS (
  SELECT MIN("id"::text) AS id FROM candidates HAVING COUNT(*)=1
 )
 UPDATE "DeviceDeploymentJob" j SET "status"='DEVICE_ACCEPTED',"startedAt"=NOW(),"resultJson"='{"attendedAgent":true,"localConsent":true}'::jsonb
 FROM unique_candidate c WHERE j."id"::text=c.id AND j."status"='AWAITING_DEVICE'
  AND (j."payloadJson"->>'expiresAt')::timestamptz>NOW()
 RETURNING j."id",j."createdBy",j."companyId",j."storeId",j."terminalId"`;
 if(jobs.length!==1)return res.status(404).json({error:'Λάθος, ληγμένος, διπλός ή ήδη χρησιμοποιημένος κωδικός.'});
 const connection=sessions.start(jobs[0]);await audit(jobs[0],'REMOTE_AGENT_LOCAL_CONSENT');
 res.status(201).json({...connection,jobId:jobs[0].id});
}catch(e){next(e)}});
const device=req=>sessions.device(req.params.jobId,String(req.headers.authorization||'').replace(/^Bearer /,''));
router.post('/:jobId/frame',async(req,res,next)=>{try{
 const s=device(req),b=req.body||{};
 if(typeof b.jpeg!=='string'||b.jpeg.length>750000||!/^\/9j\/[A-Za-z0-9+/=]+$/.test(b.jpeg)||!Number.isInteger(b.width)||!Number.isInteger(b.height)||b.width<1||b.width>8192||b.height<1||b.height>8192)return res.status(400).json({error:'Μη έγκυρη εικόνα οθόνης.'});
 res.json(sessions.frame(s,{jpeg:b.jpeg,width:b.width,height:b.height}));
}catch(e){next(e)}});
router.post('/:jobId/device-stop',async(req,res,next)=>{try{await end(device(req));res.json({stopped:true});}catch(e){next(e)}});
router.use(auth,(req,res,next)=>(req.user?.isSuperAdmin||req.user?.platformRole==='SUPER_ADMIN')?next():res.status(403).json({error:'Απαιτείται Super Admin.'}));
router.get('/:jobId/frame',async(req,res,next)=>{try{const s=sessions.controller(req.params.jobId,req.user.id);res.json(sessions.view(s));}catch(e){next(e)}});
router.post('/:jobId/input',async(req,res,next)=>{try{const s=sessions.controller(req.params.jobId,req.user.id);sessions.command(s,validateRemoteInput(req.body));res.json({queued:true});}catch(e){next(e)}});
router.post('/:jobId/stop',async(req,res,next)=>{try{await end(sessions.controller(req.params.jobId,req.user.id));res.json({stopped:true});}catch(e){next(e)}});
export default router;
