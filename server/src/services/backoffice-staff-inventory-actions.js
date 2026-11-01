import crypto from 'node:crypto';
import {z} from 'zod';
import {requireStaffAction} from './backoffice-staff-access.js';
import {lifecycleContext} from './store-lifecycle-context.js';

const entity='BACKOFFICE_INVENTORY_OPERATION';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const schemas={
  'inventory.clear':z.object({expectedVersion:z.number().int().nonnegative(),clientEventId:z.string().uuid()}).strict(),
  'inventory.bulk-zero':z.object({lines:z.array(z.object({lineId:z.string().min(1).max(200),expectedVersion:z.number().int().nonnegative()}).strict()).min(1).max(5000),clientBatchId:z.string().uuid()}).strict(),
  'inventory.delete':z.object({clientEventId:z.string().uuid(),confirmed:z.literal(true)}).strict()
};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

// Only the exact admitted personal operations use this coordinator. Owner
// routes keep their native handlers. Authorization always precedes replay.
export async function staffInventoryAction(db,req,capability){
  if(!schemas[capability]||req.user?.staffAccess!==true||req.staffGrant?.capability!==capability)fail(403,'Δεν επιτρέπεται η ενέργεια.');
  const body=schemas[capability].parse(req.body||{}),stocktakeId=req.params.stocktakeId;
  if(body.lines){body.lines.sort((a,b)=>a.lineId.localeCompare(b.lineId));if(new Set(body.lines.map(x=>x.lineId)).size!==body.lines.length)fail(400,'Η ίδια γραμμή επιλέχθηκε περισσότερες από μία φορές.');}
  const key=digest(JSON.stringify([stocktakeId,body.clientEventId||body.clientBatchId]));
  const fingerprint=digest(JSON.stringify([capability,stocktakeId,req.params.lineId||null,body,lifecycleContext()[req.user.storeId]??'0']));
  return db.$transaction(async tx=>{
    const storeId=req.user.storeId,companyId=req.user.companyId;
    await requireStaffAction(tx,req,storeId,capability);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}),hashtext(${key}))`;
    const stocks=await tx.$queryRaw`SELECT "id","storeId","status","inventoryVersion","recountPolicy" FROM "Stocktake" WHERE "id"=${stocktakeId} AND "companyId"=${companyId} FOR UPDATE`;
    const st=stocks[0];
    if(st&&(st.storeId!==storeId||st.inventoryVersion!==2))fail(404,'Δεν βρέθηκε η απογραφή.');
    const receipts=await tx.$queryRaw`SELECT "actorUserId","afterJson" FROM "WorkforceAuditLog" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "entityType"=${entity} AND "entityId"=${key} LIMIT 1`;
    if(receipts[0]){
      const receipt=receipts[0];
      if(receipt.actorUserId!==req.user.id||receipt.afterJson.fingerprint!==fingerprint)fail(409,'Η ταυτότητα ενέργειας έχει ήδη χρησιμοποιηθεί με διαφορετικά στοιχεία.');
      return {...receipt.afterJson.result,replayed:true};
    }
    if(!st)fail(404,'Δεν βρέθηκε η απογραφή.');
    if(st.status!=='DRAFT')fail(409,'Η απογραφή δεν είναι ανοικτή.');
    let result;
    const changes=[];
    if(capability==='inventory.delete'){
      const deleted=await tx.$executeRaw`DELETE FROM "Stocktake" WHERE "id"=${stocktakeId} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='DRAFT'`;
      if(deleted!==1)fail(409,'Η απογραφή άλλαξε. Ανανέωσε πριν συνεχίσεις.');
      result={ok:true,deleted:true,stocktakeId};
    }else{
      const lines=body.lines||[{lineId:req.params.lineId,expectedVersion:body.expectedVersion}],ids=lines.map(x=>x.lineId);
      const rows=await tx.$queryRaw`SELECT "id","zoneId","expectedQuantity","countedQuantity","countVersion" FROM "StocktakeLine" WHERE "stocktakeId"=${stocktakeId} AND "id"=ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
      if(rows.length!==lines.length)fail(404,'Δεν βρέθηκαν οι επιλεγμένες γραμμές στην απογραφή.');
      const versions=new Map(lines.map(x=>[x.lineId,x.expectedVersion]));
      for(const line of rows)if(Number(line.countVersion)!==versions.get(line.id))fail(409,'Μία γραμμή ενημερώθηκε από άλλο χρήστη. Ανανέωσε πριν συνεχίσεις.');
      for(const line of rows){
        const eventId=body.clientEventId||`${body.clientBatchId}:${line.id}`;
        const collisions=await tx.$queryRaw`SELECT "id" FROM "InventoryCountEvent" WHERE "stocktakeId"=${stocktakeId} AND "clientEventId"=${eventId} LIMIT 1`;
        if(collisions[0])fail(409,'Η ταυτότητα καταμέτρησης έχει ήδη χρησιμοποιηθεί.');
        const clear=capability==='inventory.clear',previous=line.countedQuantity===null?null:Number(line.countedQuantity),expected=Number(line.expectedQuantity);
        const eventType=clear?'CLEAR':previous===null?'COUNT':'RECOUNT';
        changes.push({lineId:line.id,eventType,previousQuantity:previous,countedQuantity:clear?null:0,previousVersion:Number(line.countVersion),clientEventId:eventId});
        const recountRequired=!clear&&(st.recountPolicy==='ALL'?eventType==='COUNT':st.recountPolicy==='DIFFERENCES'?eventType==='COUNT'&&Math.abs(expected)>0.0001:false);
        await tx.$executeRaw`UPDATE "StocktakeLine" SET "countedQuantity"=${clear?null:0},"countedByUserId"=${clear?null:req.user.id},"countedAt"=${clear?null:new Date()},"countVersion"="countVersion"+1,"recountRequired"=${recountRequired},"countSource"=${clear?null:'BACKOFFICE'},"updatedAt"=NOW() WHERE "id"=${line.id} AND "stocktakeId"=${stocktakeId}`;
        await tx.$executeRaw`INSERT INTO "InventoryCountEvent" ("id","companyId","storeId","stocktakeId","lineId","zoneId","eventType","previousQuantity","countedQuantity","expectedQuantity","actorId","actorName","source","clientEventId") VALUES (${crypto.randomUUID()},${companyId},${storeId},${stocktakeId},${line.id},${line.zoneId},${eventType},${previous},0,${expected},${req.user.id},${req.user.fullName||'Χειριστής'},'BACKOFFICE',${eventId})`;
      }
      result={ok:true,updated:rows.length,stocktakeId};
    }
    await tx.$executeRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${crypto.randomUUID()},${companyId},${storeId},${req.user.id},${capability},${entity},${key},${JSON.stringify({fingerprint,stocktakeId,capability,result,changes})}::jsonb,NOW())`;
    return result;
  });
}
