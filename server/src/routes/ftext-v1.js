import {Router} from 'express';
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
 const prefix='/companies/:companyId/stores/:storeId';
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
