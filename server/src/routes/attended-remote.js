import {Router} from 'express';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {createAttendedRemote,attendedRemoteGate} from '../lib/attended-remote.js';
import {validateRemoteInput} from '../lib/remote-agent-session.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createAttendedRemoteRouter({db=prisma,authenticate=auth,env=process.env,service=null}={}){
 const router=Router(),allowed=attendedRemoteGate(env);
 const audit=async(j,event)=>{if(j)await db.authAudit.create({data:{userId:j.createdBy,email:'remote-support',event,success:true,deviceName:`${j.storeId}:${j.terminalId}`}});};
 const remote=service||createAttendedRemote({onStop:(j,reason)=>{audit(j,`ATTENDED_REMOTE_STOP_${reason}`).catch(()=>{});}});
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const terminal=async scope=>{
  if(!allowed(scope.terminalId)||String(scope.companyId).startsWith('customer-demo-')||String(scope.storeId).startsWith('customer-demo-'))throw fail(403,'Η υποστήριξη δεν έχει ενεργοποιηθεί για αυτό το POS.');
  const rows=await db.$queryRaw`SELECT t."id",t."companyId",t."storeId",t."displayName" AS "terminalName",s."name" AS "storeName" FROM "StoreInstallationTerminal" t JOIN "Store" s ON s."id"=t."storeId" AND s."companyId"=t."companyId" JOIN "Company" c ON c."id"=s."companyId" WHERE t."id"=${scope.terminalId} AND t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} AND t."active"=TRUE AND s."active"=TRUE AND c."active"=TRUE LIMIT 1`;
  if(!rows[0])throw fail(403,'Το POS δεν είναι ενεργό.');return {...scope,...rows[0],terminalId:scope.terminalId};
 };
 const authority=async j=>{
  try{await terminal(j);}catch(e){remote.stop(j.id,'AUTHORITY_REVOKED');throw e;}
  const u=await db.userSession.findUnique({where:{id:j.creatorSessionId},include:{user:true}});
  if(!u||u.userId!==j.createdBy||u.revokedAt||new Date(u.expiresAt)<=new Date()||(u.user?.role!=='SUPER_ADMIN'||u.user?.mustChangePassword===true)||j.creatorSessionVersion!==u.user?.sessionVersion){remote.stop(j.id,'AUTHORITY_REVOKED');throw fail(403,'Η πρόσβαση του διαχειριστή έχει διακοπεί.');}
  if(j.consentSessionId){const rows=await db.$queryRaw`SELECT os."id" FROM "StoreOperatorSession" os JOIN "StoreOperatorCredential" c ON c."id"=os."operatorId" JOIN "Employee" e ON e."id"=c."employeeId" LEFT JOIN "StoreOperatorProfile" p ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE os."id"=${j.consentSessionId} AND os."revokedAt" IS NULL AND os."expiresAt">NOW() AND c."id"=${j.consentOperatorId} AND c."employeeId"=${j.consentEmployeeId} AND c."companyId"=${j.companyId} AND c."storeId"=${j.storeId} AND c."role"=${j.consentRole} AND c."active"=TRUE AND e."active"=TRUE AND COALESCE(p."posAccess",TRUE)=TRUE LIMIT 1`;if(!rows[0]){remote.stop(j.id,'AUTHORITY_REVOKED');throw fail(403,'Ο χειριστής αποσυνδέθηκε.');}}
 };
 const device=async req=>{const s=remote.sessions.device(req.params.id,String(req.headers.authorization||'').replace(/^Bearer /,''));await authority(s);return remote.sessions.device(req.params.id,String(req.headers.authorization||'').replace(/^Bearer /,''));};
 // The browser has already recorded a fresh, exact-terminal local consent. This one-use
 // handoff reaches only the loopback agent; it is not a reusable operator credential.
 router.post('/pair',wrap(async(req,res)=>{const grant=req.body?.grant;if(typeof grant!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(grant))throw fail(400,'Μη έγκυρη αποδοχή.');const j=remote.grantJob(grant);await authority(j);const result=remote.pair(grant);try{await audit(j,'ATTENDED_REMOTE_CONNECTED');}catch(e){remote.stop(j.id,'AUDIT_FAILED');throw e;}res.status(201).json(result);}));
 router.post('/device/:id/frame',wrap(async(req,res)=>{const s=await device(req),b=req.body||{};if(typeof b.jpeg!=='string'||b.jpeg.length>750000||!/^\/9j\/[A-Za-z0-9+/=]+$/.test(b.jpeg)||!Number.isInteger(b.width)||!Number.isInteger(b.height)||b.width<1||b.height<1||b.width>8192||b.height>8192)throw fail(400,'Μη έγκυρη εικόνα.');const result=remote.sessions.frame(s,{jpeg:b.jpeg,width:b.width,height:b.height});remote.frameAvailable(s.id);res.json({...result,files:remote.files.list(s.id)});}));
 router.post('/device/:id/stop',wrap(async(req,res)=>{const s=remote.sessions.device(req.params.id,String(req.headers.authorization||'').replace(/^Bearer /,''));remote.stop(s.id,'DEVICE_STOP');res.json({stopped:true});}));
 const transferRoutes=(prefix,resolve,sender)=>{
  router.post(`${prefix}/files`,wrap(async(req,res)=>{const s=await resolve(req);const file=remote.files.create(s.id,sender,req.body||{});try{await audit(s,'ATTENDED_REMOTE_FILE_STARTED');}catch(e){remote.files.remove(s.id,file.id);throw e;}res.status(201).json(file);}));
  router.post(`${prefix}/files/:fileId/chunk`,wrap(async(req,res)=>{const s=await resolve(req);res.json(remote.files.append(s.id,req.params.fileId,sender,req.body||{}));}));
  router.get(`${prefix}/files/:fileId/chunk`,wrap(async(req,res)=>{const s=await resolve(req);res.json(remote.files.chunk(s.id,req.params.fileId,sender,Number(req.query.offset)));}));
  router.post(`${prefix}/files/:fileId/finish`,wrap(async(req,res)=>{const s=await resolve(req);remote.files.remove(s.id,req.params.fileId);await audit(s,'ATTENDED_REMOTE_FILE_CLOSED');res.json({closed:true});}));
 };
 transferRoutes('/device/:id',device,'TO_CONTROLLER');
 router.use(authenticate);
 const operator=req=>{const u=req.user;if(u?.tokenType!=='STORE_OPERATOR'||!u.operatorSessionId||!u.terminalId)throw fail(403,'Απαιτείται ενεργός χειριστής στο δεσμευμένο POS.');return u;};
 router.get('/pos/pending',wrap(async(req,res)=>{const u=operator(req);if(!allowed(u.terminalId))return res.json({enabled:false,invitation:null});await terminal(u);res.json({enabled:true,invitation:remote.pending(u),current:remote.current(u)});}));
 router.post('/pos/:id/consent',wrap(async(req,res)=>{const u=operator(req);await terminal(u);if(req.body?.accepted!==true)throw fail(400,'Απαιτείται Αποδοχή.');const j=remote.get(req.params.id);if(j.companyId!==u.companyId||j.storeId!==u.storeId||j.terminalId!==u.terminalId)throw fail(403,'Άλλο POS.');await authority(j);const result=remote.consent(j.id,u,u);try{await audit(j,'ATTENDED_REMOTE_POS_CONSENT');}catch(e){remote.stop(j.id,'AUDIT_FAILED');throw e;}res.json(result);}));
 router.post('/pos/:id/stop',wrap(async(req,res)=>{const u=operator(req);remote.reject(req.params.id,u);res.json({stopped:true});}));
 router.use((req,res,next)=>(req.user?.isSuperAdmin||req.user?.role==='SUPER_ADMIN'||req.user?.platformRole==='SUPER_ADMIN')?next():res.status(403).json({error:'Απαιτείται Super Admin.'}));
 router.get('/sessions',wrap(async(req,res)=>{res.json({items:remote.list(req.user.id)});}));
 router.post('/invitations',wrap(async(req,res)=>{if(!req.user.sessionId)throw fail(401,'Απαιτείται ενεργή ασφαλής συνεδρία.');const b=req.body||{};if(['companyId','storeId','terminalId'].some(k=>typeof b[k]!=='string'||!b[k].length||b[k].length>100))throw fail(400,'Επίλεξε συγκεκριμένο κατάστημα και POS.');const scope=await terminal(b);const j=remote.invite({companyId:scope.companyId,storeId:scope.storeId,terminalId:scope.terminalId,storeName:scope.storeName,terminalName:scope.terminalName},req.user);try{await audit(remote.get(j.id),'ATTENDED_REMOTE_INVITED');}catch(e){remote.stop(j.id,'AUDIT_FAILED');throw e;}res.status(201).json(j);}));
 const controller=async req=>{const j=remote.controller(req.params.id,req.user);await authority(j);return remote.sessions.controller(j.id,req.user.id);};
 // Network-driven events keep independent background windows alive without depending
 // on browser setInterval throttling. Closing this particular response revokes only it.
 router.get('/controller/:id/stream',wrap(async(req,res)=>{
  const job=remote.controller(req.params.id,req.user);await authority(job);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
  let closed=false,busy=false,timer,unsubscribe=()=>{};
  const close=(reason='STREAM_CLOSED')=>{if(closed)return;closed=true;clearTimeout(timer);unsubscribe();remote.stop(job.id,reason);};
  res.on('close',()=>close());
  const write=packet=>new Promise((resolve,reject)=>{
   if(res.write(`data: ${JSON.stringify(packet)}\n\n`))return resolve();
   const done=()=>{clearTimeout(timeout);res.off('drain',drain);res.off('close',lost);};
   const drain=()=>{done();resolve();},lost=()=>{done();reject(Error('closed'));};
   const timeout=setTimeout(()=>{done();reject(Error('backpressure'));},10000);timeout.unref();res.once('drain',drain);res.once('close',lost);
  });
  const tick=async()=>{if(closed||busy)return;clearTimeout(timer);busy=true;try{const j=remote.controller(job.id,req.user);await authority(j);if(closed)return;if(j.state!=='ACTIVE')await write({pending:true,storeName:j.storeName,terminalName:j.terminalName,files:[]});else{const s=remote.sessions.controller(j.id,req.user.id);await write({...remote.sessions.view(s,{touch:false}),storeName:s.storeName,terminalName:s.terminalName,files:remote.files.list(s.id)});}}catch(e){if(!closed){try{res.write(`data: ${JSON.stringify({error:'Η πρόσβαση σταμάτησε. Χρειάζεται νέο αίτημα και Αποδοχή.'})}\n\n`);}catch{}close(e.message==='backpressure'?'STREAM_BACKPRESSURE':'STREAM_ERROR');res.end();}}finally{busy=false;if(!closed){timer=setTimeout(tick,1000);timer.unref();}}};
  // Forward a freshly received frame immediately; the timer only validates quiet endpoints.
  unsubscribe=remote.onFrame(job.id,tick);await tick();
 }));
 router.get('/controller/:id/frame',wrap(async(req,res)=>{const s=await controller(req);res.json({...remote.sessions.view(s),storeName:s.storeName,terminalName:s.terminalName,files:remote.files.list(s.id)});}));
 router.post('/controller/:id/heartbeat',wrap(async(req,res)=>{const s=await controller(req);remote.sessions.view(s);res.json({alive:true});}));
 router.post('/controller/:id/input',wrap(async(req,res)=>{const s=await controller(req);remote.sessions.command(s,validateRemoteInput(req.body));res.json({queued:true});}));
 router.post('/controller/:id/stop',wrap(async(req,res)=>{remote.controller(req.params.id,req.user);remote.stop(req.params.id,'CONTROLLER_STOP');res.json({stopped:true});}));
 transferRoutes('/controller/:id',controller,'TO_DEVICE');
 const timer=setInterval(()=>remote.sweep(),5000);timer.unref();
 router.close=()=>clearInterval(timer);
 return router;
}
export default createAttendedRemoteRouter();
