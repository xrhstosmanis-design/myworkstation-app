import {Router} from 'express';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {companyModuleState,isPlatformSuperAdmin,requireCompanyModule} from '../middleware/module-access.js';
import {createProductionPrinting} from '../services/production-printing.js';
import {readFile} from 'node:fs/promises';
export const productionPrinting=createProductionPrinting({db:prisma,moduleState:id=>companyModuleState(id)});
export function createProductionPrinterRouter({service=productionPrinting,userAuth=auth,moduleAccess=requireCompanyModule('STORE_MODE')}={}){
 const router=Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(e){if(e.name==='ZodError')return res.status(400).json({error:'Έλεγξε τις ρυθμίσεις εκτυπωτή.'});next(e)}};
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const token=req=>String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const attempts=new Map();
 router.post('/pair',(req,res,next)=>{const now=Date.now(),key=req.ip||'unknown';let value=attempts.get(key);if(!value||value.until<now){if(attempts.size>=5000){for(const[k,v]of attempts)if(v.until<now)attempts.delete(k);if(attempts.size>=5000)return res.status(429).json({error:'Δοκίμασε αργότερα.'})}value={until:now+60000,count:0};attempts.set(key,value)}if(++value.count>10)return res.status(429).json({error:'Περίμενε ένα λεπτό.'});next()},wrap(async(req,res)=>res.json(await service.pair(req.body?.code))));
 router.post('/device/next',wrap(async(req,res)=>res.json(await service.claim(token(req)))));
 router.post('/device/result',wrap(async(req,res)=>res.json(await service.acknowledge(token(req),req.body?.id,req.body?.claimId,req.body?.status))));
 router.use(userAuth,moduleAccess);
 const scope=(req,res,next)=>{if(req.user?.tokenType==='STORE_OPERATOR'&&req.user.storeId!==req.params.storeId)return res.status(403).json({error:'Λάθος κατάστημα.'});next()};
 const manager=(req,res,next)=>isPlatformSuperAdmin(req.user)?next():res.status(403).json({error:'Απαιτείται Platform Super Admin.'});
 const prefix='/stores/:storeId';
 router.get(prefix,scope,wrap(async(req,res)=>{const state=await service.view(req.user.companyId,req.params.storeId);res.json({...state,canConfigure:isPlatformSuperAdmin(req.user)})}));
 router.put(prefix,scope,manager,wrap(async(req,res)=>res.json({...await service.configure(req.user.companyId,req.params.storeId,req.body),canConfigure:true})));
 router.post(prefix+'/pairing',scope,manager,wrap(async(req,res)=>res.json(await service.pairing(req.user.companyId,req.params.storeId))));
 router.post(prefix+'/jobs/:id/resolve',scope,manager,wrap(async(req,res)=>res.json(await service.resolve(req.user.companyId,req.params.storeId,req.user.id,req.params.id,req.body))));
 router.get(prefix+'/connector',scope,manager,wrap(async(req,res)=>{await service.view(req.user.companyId,req.params.storeId);res.json({script:await readFile(new URL('../../../tools/windows-production-printer/Connector.ps1',import.meta.url),'utf8')})}));
 return router;
}
export default createProductionPrinterRouter();
