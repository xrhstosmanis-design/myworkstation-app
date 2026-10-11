import {changeSameProductBakedStock,sameProductBakingSchema} from '../store-baking-same-product.js';
import {Router} from 'express';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {ensureStoreBakingSchema,recordBaking,readBakingPolicy,readStoreBakingState} from '../store-baking.js';
const router=Router();router.use(auth);
async function context(req){
 const storeId=req.params.storeId;
 if(req.user?.tokenType==='STORE_OPERATOR'&&req.user.storeId!==storeId)throw Object.assign(new Error('Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.'),{status:403});
 if(req.user?.tokenType!=='STORE_OPERATOR'&&!['OWNER','ADMIN','MANAGER','SUPER_ADMIN'].includes(req.user?.role))throw Object.assign(new Error('Δεν έχετε δικαίωμα καταχώρισης ψησίματος.'),{status:403});
 const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true}});
 if(!store)throw Object.assign(new Error('Δεν βρέθηκε ενεργό κατάστημα.'),{status:404});
 await ensureStoreBakingSchema(prisma);return store;
}
router.get('/stores/:storeId/baking',async(req,res,next)=>{try{
 const store=await context(req),companyId=req.user.companyId;
 res.json(await readStoreBakingState(prisma,companyId,store.id));
 }catch(e){next(e)}});
router.post('/stores/:storeId/baking',async(req,res,next)=>{try{
 const store=await context(req),result=await prisma.$transaction(async tx=>{
 const ctx={companyId:req.user.companyId,storeId:store.id,actorId:req.user.id,actorName:req.user.fullName||'Χειριστής',body:req.body};
 if(req.body?.sourceProductId)return recordBaking(tx,ctx);
 const value=sameProductBakingSchema.parse(req.body),policy=await readBakingPolicy(tx,ctx.companyId,ctx.storeId,value.productId);
 if(policy?.mode!=='BAKED_SAME')throw Object.assign(new Error('Ο κανόνας ψημένων άλλαξε. Ανανεώστε τα είδη.'),{status:409});
 return changeSameProductBakedStock(tx,{...ctx,kind:'BAKE',body:value});
 });
 res.status(result.duplicate?200:201).json(result);
 }catch(e){if(e?.name==='ZodError')return res.status(400).json({error:'Ελέγξτε είδος, ακέραια ποσότητα και στοιχεία ψησίματος.'});next(e)}});
export default router;
