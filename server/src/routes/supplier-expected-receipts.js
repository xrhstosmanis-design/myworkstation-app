import {lifecycleContext} from '../services/store-lifecycle-context.js';
import {Router} from 'express';
import {prisma} from '../prisma.js';
import {requireStoreModule} from '../middleware/module-access.js';
import {assertExpectedReceiptAuthority,expectedReceiptReadiness,expectedReceiptRows,mutateExpectedReceipt,hasExpectedReceiptIntent,rejectExpectedReceiptIntent,postedReceiptSource} from '../services/supplier-expected-receipts.js';

export function createExpectedReceiptRouter(db=prisma,{moduleGuard=requireStoreModule}={}){
  const router=Router();
  router.use('/expected-receipts',moduleGuard('ORDER_SUGGESTIONS'));
  const scope=req=>({storeId:req.targetStore.id,companyId:req.targetStore.companyId});
  router.get('/expected-receipts',async(req,res,next)=>{try{
    const target=scope(req);
    await assertExpectedReceiptAuthority(db,req,target);
    const readiness=await expectedReceiptReadiness(db);
    if(!readiness.available){res.set('Cache-Control','no-store');return res.status(503).json({storeId:target.storeId,...readiness,error:readiness.reason})}
    const result=await db.$transaction(async tx=>{
      await assertExpectedReceiptAuthority(tx,req,target);
      const rows=await expectedReceiptRows(tx,target);
      const suppliers=await tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${target.companyId} AND "active"=TRUE ORDER BY "name","id" LIMIT 2001`;
      if(suppliers.length>2000)throw Object.assign(new Error('Πάρα πολλοί προμηθευτές για πλήρη επιλογή.'),{status:409});
      return {actorId:req.user.id,companyId:target.companyId,lifecycleGeneration:lifecycleContext()[target.storeId]??'0',storeId:target.storeId,rows,suppliers,canWrite:req.user.staffAccess===true?req.staffGrant?.capabilities?.includes('invoices.approve')===true:['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(req.user.role),sourceSupport:'PURCHASE_ORDER_ONLY',sourceSupportNote:'Συνδέονται υπάρχουσες καταχωρισμένες αγορές παραγγελίας. Τα αυτόνομα παραστατικά χρειάζονται χωριστό έλεγχο παραλαβής.'};
    },{isolationLevel:'RepeatableRead',timeout:30000});
    res.set('Cache-Control','no-store');res.json(result);
  }catch(error){next(error)}});
  router.get('/expected-receipts/candidates',async(req,res,next)=>{try{
    const target=scope(req),expectedId=String(req.query.expectedId||'');
    await assertExpectedReceiptAuthority(db,req,target);
    const readiness=await expectedReceiptReadiness(db);
    if(!readiness.available){res.set('Cache-Control','no-store');return res.status(503).json({storeId:target.storeId,...readiness,error:readiness.reason})}
    const result=await db.$transaction(async tx=>{
      await assertExpectedReceiptAuthority(tx,req,target);
      const expected=(await expectedReceiptRows(tx,target)).find(row=>row.id===expectedId);
      if(!expected)throw Object.assign(new Error('Δεν βρέθηκε αναμονή.'),{status:404});
      const orders=await tx.$queryRaw`SELECT DISTINCT o."id" FROM "PurchaseOrder" o JOIN "PurchaseOrderPosting" pp ON pp."orderId"=o."id" AND pp."companyId"=o."companyId" JOIN "StockMovement" sm ON sm."sourceId"=o."id" AND sm."sourceType"='PURCHASE_ORDER' AND sm."storeId"=o."storeId" AND sm."productId"=${expected.productId} WHERE o."companyId"=${target.companyId} AND o."storeId"=${target.storeId} AND o."supplierId"=${expected.supplierId} AND o."status" IN ('FINAL','INVOICED') ORDER BY o."id" LIMIT 101`;
      const rows=[];
      for(const order of orders.slice(0,100)){
        try{const source=await postedReceiptSource(tx,target,order.id,expected.productId);if(Number(source.available)>0)rows.push(source)}
        catch(error){if(error.status!==409)throw error;rows.push({orderId:order.id,reviewReason:error.message})}
      }
      return {storeId:target.storeId,expectedId,rows,hasMore:orders.length>100,sourceSupport:'PURCHASE_ORDER_ONLY',reviewReason:expected.reviewReason,postedPurchaseReviewReason:expected.postedPurchaseReviewReason};
    },{isolationLevel:'RepeatableRead',timeout:30000});
    res.set('Cache-Control','no-store');res.json(result);
  }catch(error){next(error)}});
  for(const [path,action] of [['/expected-receipts','confirm'],['/expected-receipts/:expectedId/link','link'],['/expected-receipts/:expectedId/cancel-remaining','cancel']])router.post(path,async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');res.json(await mutateExpectedReceipt(db,req,scope(req),action,req.params.expectedId||null));
  }catch(error){
    // No business transaction remains open here. Only a separate, locked outcome
    // transaction may make a failed journal intent terminal for future retries.
    const target=scope(req);
    if(hasExpectedReceiptIntent(req,target)&&(error.status===409||error.name==='ZodError')){
      try{return res.json(await rejectExpectedReceiptIntent(db,req,target,action,req.params.expectedId||null,error));}
      catch(outcomeError){return next(outcomeError)}
    }
    next(error);
  }});
  return router;
}
export default createExpectedReceiptRouter();
