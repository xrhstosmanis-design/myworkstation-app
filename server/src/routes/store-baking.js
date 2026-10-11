import {Router} from 'express';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {ensureStoreBakingSchema,recordBaking} from '../store-baking.js';
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
 const [products,history]=await Promise.all([
 prisma.$queryRaw`SELECT bp."productId",bp."sourceProductId",p."name",p."sku",raw."name" AS "sourceName",COALESCE(sp."currentStock",0) AS "currentStock",COALESCE(rawsp."currentStock",0) AS "sourceStock" FROM "StoreBakingPolicy" bp JOIN "Product" p ON p."id"=bp."productId" AND p."companyId"=bp."companyId" AND p."active"=TRUE JOIN "Product" raw ON raw."id"=bp."sourceProductId" AND raw."companyId"=bp."companyId" AND raw."active"=TRUE JOIN "StoreProduct" sp ON sp."storeId"=bp."storeId" AND sp."productId"=p."id" AND sp."active"=TRUE JOIN "StoreProduct" rawsp ON rawsp."storeId"=bp."storeId" AND rawsp."productId"=raw."id" AND rawsp."active"=TRUE WHERE bp."companyId"=${companyId} AND bp."storeId"=${store.id} AND bp."mode"='BAKED' ORDER BY p."name"`,
 prisma.$queryRaw`SELECT e.*,p."name" FROM "StoreBakingEntry" e JOIN "Product" p ON p."id"=e."productId" AND p."companyId"=e."companyId" WHERE e."companyId"=${companyId} AND e."storeId"=${store.id} ORDER BY e."createdAt" DESC,e."id" DESC LIMIT 100`
 ]);res.json({storeId:store.id,products,history});
 }catch(e){next(e)}});
router.post('/stores/:storeId/baking',async(req,res,next)=>{try{
 const store=await context(req),result=await prisma.$transaction(tx=>recordBaking(tx,{companyId:req.user.companyId,storeId:store.id,actorId:req.user.id,actorName:req.user.fullName||'Χειριστής',body:req.body}));
 res.status(result.duplicate?200:201).json(result);
 }catch(e){if(e?.name==='ZodError')return res.status(400).json({error:'Ελέγξτε είδος, ακέραια ποσότητα και στοιχεία ψησίματος.'});next(e)}});
export default router;
