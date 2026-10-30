import {ftextOperatorCardMode} from '../services/ftext-operator-card.js';
import {recordLateCashReceipt} from '../services/ftext-late-cash-receipt.js';
import {pollFtextErrorEvidence,recordFtextErrorEvidence,ftextPaymentError} from '../services/ftext-error-evidence.js';
import {claimFtextVoid,requestFtextVoid,recordFtextVoidResult} from '../services/ftext-void.js';
import {Router} from 'express';
import {claimFtextCashRequest,recordFtextCashResult,ftextCashRequestView} from '../services/ftext-cash-requests.js';
import {finalizeFtextCashRequest} from '../services/ftext-cash-finalize.js';
import {ftextCashTableExists} from '../services/ftext-cash-schema.js';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {companyModuleState,isPlatformSuperAdmin} from '../middleware/module-access.js';
import {ensureCloudTables} from './cloud-v1.js';
import {createFtextInstallationService} from '../services/ftext-installation.js';
import {buildFtextInstallationPackage} from '../services/ftext-installation-package.js';

export function createFtextRouter({service,db,userAuth=auth,ensure=ensureCloudTables,apiBase='https://myworkstation-app.onrender.com',revision='unknown',clock=()=>Date.now()}){
 const router=Router(),attempts=new Map();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const wrap=fn=>async(req,res,next)=>{try{await ensure();await fn(req,res)}catch(e){if(e.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της σύνδεσης ftext.'});next(e)}};
 const manager=(req,res,next)=>{if(!isPlatformSuperAdmin(req.user))return res.status(403).json({error:'Απαιτείται Platform Super Admin.'});next()};
 const scoped=req=>({companyId:req.params.companyId,storeId:req.params.storeId,terminalPos:req.params.terminalPos||req.body?.terminalPos});
 const token=req=>String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 router.post('/pair',(req,res,next)=>{
  const now=clock(),key=req.ip||'unknown';let item=attempts.get(key);
  if(!item||item.until<=now){if(attempts.size>=5000){for(const[k,v]of attempts)if(v.until<=now)attempts.delete(k);if(attempts.size>=5000)return res.status(429).json({error:'Δοκίμασε τη ζεύξη αργότερα.'});}item={count:0,until:now+60000};attempts.set(key,item)}
  if(++item.count>10)return res.status(429).json({error:'Πάρα πολλές προσπάθειες ζεύξης. Περίμενε ένα λεπτό.'});next();
 },wrap(async(req,res)=>res.status(201).json(await service.pair(req.body))));
 router.post('/device/ping',wrap(async(req,res)=>res.json(await service.ping(token(req)))));
 router.post('/device/status-result',wrap(async(req,res)=>res.json(await service.report(token(req),req.body))));
 router.post('/device/error-evidence-poll',wrap(async(req,res)=>res.json(await service.authenticated(token(req),async(t,d,c)=>({request:c.cashEnabled===true&&await ftextCashTableExists(t)?await pollFtextErrorEvidence(t,d,c):null})))));
 router.post('/device/error-evidence-result',wrap(async(req,res)=>{const row=await service.authenticated(token(req),async(t,d,c)=>recordFtextErrorEvidence(t,d,c,req.body));res.json({ok:true,requestId:row.id,evidenceHash:row.checkoutJson.ftextLateError.evidenceHash,status:row.status})}));
 router.post('/device/void-poll',wrap(async(req,res)=>res.json(await service.authenticated(token(req),async(t,d,c)=>({request:c.cashEnabled===true&&await ftextCashTableExists(t)?await claimFtextVoid(t,d,c):null})))));
 router.post('/device/void-result',wrap(async(req,res)=>{const row=await service.authenticated(token(req),async(t,d,c)=>recordFtextVoidResult(t,d,c,req.body));res.json({ok:true,status:row.checkoutJson.ftextVoid.status})}));
 router.post('/device/cash-poll',wrap(async(req,res)=>res.json(await service.authenticated(token(req),async(t,d,c)=>({request:c.cashEnabled===true&&await ftextCashTableExists(t)?await claimFtextCashRequest(t,d,c):null})))));
 router.post('/device/cash-result',wrap(async(req,res)=>{
  const row=await service.authenticated(token(req),async(t,d,c)=>recordFtextCashResult(t,d,c,req.body));
  let committed=null;if(row.status==='CONFIRMED'&&!ftextOperatorCardMode(row))try{committed=await finalizeFtextCashRequest(db,row.id,row,{context:service.cashContext})}catch{}
  res.json({ok:true,status:committed?'SALE_COMMITTED':row.status,saleId:committed?.saleId||row.saleId||null,finalizationPending:row.status==='CONFIRMED'&&!committed});
 }));
 const prefix='/companies/:companyId/stores/:storeId';
 router.post(prefix+'/installation/:terminalPos/requests/:requestId/late-cash-receipt',userAuth,manager,wrap(async(req,res)=>{
  const scope=scoped(req),row=await db.$transaction(tx=>recordLateCashReceipt(tx,scope,req.params.requestId,req.user.id,req.body,{context:service.cashContext}));
  const completed=await finalizeFtextCashRequest(db,row.id,scope,{context:service.cashContext});
  res.json({ok:true,requestId:row.id,status:'SALE_COMMITTED',saleId:completed.saleId,replay:completed.replay,allowResend:false});
 }));
 router.get(prefix+'/installation/:terminalPos/unresolved',userAuth,manager,wrap(async(req,res)=>{
  const scope=scoped(req),rows=await db.$transaction(async tx=>{await service.cashContext(tx,scope,{requireOnline:false});if(!await ftextCashTableExists(tx))return [];return tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} AND "status"<>'SALE_COMMITTED' AND COALESCE("checkoutJson"->'ftextVoid'->>'status','')<>'CONFIRMED' ORDER BY "createdAt" LIMIT 1`});
  const error=ftextPaymentError(rows[0]);res.json({request:rows[0]?{...ftextCashRequestView(rows[0]),resultCode:error?.code??rows[0].result?.code,failedCommand:error?.failedCommand??rows[0].result?.failedCommand}:null});
 }));
 router.post(prefix+'/installation/:terminalPos/requests/:requestId/void',userAuth,manager,wrap(async(req,res)=>{
  const scope=scoped(req),row=await db.$transaction(async tx=>requestFtextVoid(tx,scope,req.params.requestId,req.user.id,req.body,await service.cashContext(tx,scope)));res.json({request:ftextCashRequestView(row)});
 }));
 router.get(prefix+'/installation/:terminalPos',userAuth,manager,wrap(async(req,res)=>res.json(await service.view(scoped(req)))));
 router.put(prefix+'/installation',userAuth,manager,wrap(async(req,res)=>res.json(await service.configure(scoped(req),req.body,req.user.id))));
 router.post(prefix+'/installation/:terminalPos/pairing',userAuth,manager,wrap(async(req,res)=>res.status(201).json(await service.createPairing(scoped(req),req.user.id))));
 router.post(prefix+'/installation/:terminalPos/package',userAuth,manager,wrap(async(req,res)=>{
  const scope=scoped(req),state=await service.view(scope),store=await db.store.findFirst({where:{id:scope.storeId,companyId:scope.companyId,active:true},select:{id:true,companyId:true,name:true}});
  if(!store||!state.settings||!state.settingsCurrent)return res.status(409).json({error:'Χρειάζονται τρέχουσες ρυθμίσεις, ενεργή άδεια και ενεργή αντιστοίχιση POS–ταμειακής.'});
  res.json(await buildFtextInstallationPackage({store,settings:state.settings,apiBase,revision}));
 }));
 return router;
}
const service=createFtextInstallationService({db:prisma,moduleState:(id,tx)=>companyModuleState(id,{db:tx}),secret:()=>process.env.JWT_SECRET});
export default createFtextRouter({service,db:prisma,apiBase:process.env.PUBLIC_APP_URL||'https://myworkstation-app.onrender.com',revision:process.env.RENDER_GIT_COMMIT||process.env.APP_REVISION||'unknown'});
