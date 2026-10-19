import {Router} from 'express';
import {auth} from '../middleware/auth.js';
import {prisma} from '../prisma.js';
import {readLifecycleGeneration} from '../services/store-lifecycle-generation.js';
export function lifecycleStateHandler(db){return async(req,res,next)=>{try{
 const storeId=req.params.storeId,user=req.user;
 if(user.storeId&&user.storeId!==storeId)return res.status(403).json({error:'Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.'});
 const platform=user.isSuperAdmin===true||user.platformRole==='SUPER_ADMIN';
 if(!platform&&!user.companyId)return res.status(403).json({error:'Απαιτείται συγκεκριμένη εταιρεία.'});
 const store=await db.store.findFirst({where:{id:storeId,active:true,...(platform?{}:{companyId:user.companyId})},select:{id:true,companyId:true}});
 if(!store)return res.status(404).json({error:'Δεν βρέθηκε ενεργό κατάστημα.'});
 res.setHeader('Cache-Control','no-store');res.json({storeId:store.id,...await readLifecycleGeneration(db,{companyId:store.companyId,storeId:store.id})});
 }catch(error){next(error)}}}
const router=Router();router.use(auth);router.get('/stores/:storeId',lifecycleStateHandler(prisma));export default router;
