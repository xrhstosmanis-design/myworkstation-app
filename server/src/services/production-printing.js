import crypto from 'node:crypto';
import {z} from 'zod';
import {readLifecycleGeneration,assertLifecycleMutation} from './store-lifecycle-generation.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const printerSchema=z.object({enabled:z.boolean(),name:z.string().trim().min(1).max(80),transport:z.enum(['NETWORK','WINDOWS']),host:z.string().regex(/^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/).refine(v=>v.split('.').every(n=>Number(n)<=255)),port:z.number().int().min(1).max(65535).default(9100),windowsName:z.string().trim().max(160).default(''),codePage:z.number().int().min(0).max(255).default(17),cut:z.boolean().default(true),productIds:z.array(z.string().min(1)).max(1000)}).refine(v=>!v.enabled||v.productIds.length>0,{message:'Επίλεξε τα προϊόντα του εκτυπωτή.'}).refine(v=>v.transport!=='WINDOWS'||v.windowsName.length>0,{message:'Συμπλήρωσε τον εκτυπωτή Windows.'});
export const printableText=value=>String(value??'').normalize('NFC').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,1000);
export function productionTicket(items,products){
 const byId=new Map(products.map(p=>[p.id,p]));
 return items.map(p=>({productId:p.productId,name:printableText(byId.get(p.productId)?.name),quantity:p.quantity,modifiers:(p.modifiers||[]).map(m=>printableText(m.description)),note:printableText(p.note),allergens:(p.allergens||[]).map(printableText)}));
}
export function createProductionPrinting({db,moduleState}){
 let ready;
 const ensure=()=>ready||(ready=(async()=>{
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductionPrinter" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"settings" JSONB NOT NULL,"tokenHash" TEXT,"pairHash" TEXT,"pairUntil" TIMESTAMPTZ,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.$executeRawUnsafe(`ALTER TABLE "ProductionPrinter" ADD COLUMN IF NOT EXISTS "lifecycleGeneration" TEXT NOT NULL DEFAULT '0'`);
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductionPrintResolution" ("jobId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"reason" TEXT NOT NULL,"status" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductionPrintRequest" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"requestId" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"batchId" TEXT NOT NULL,"response" JSONB NOT NULL,PRIMARY KEY("companyId","storeId","requestId"))`);
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductionPrintJob" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"batchId" TEXT NOT NULL UNIQUE,"ticket" JSONB NOT NULL,"status" TEXT NOT NULL DEFAULT 'QUEUED',"claimId" TEXT,"claimedBy" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"claimedAt" TIMESTAMPTZ,"finishedAt" TIMESTAMPTZ)`);
 })().catch(e=>{ready=null;throw e}));
 async function store(companyId,storeId){const row=await db.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,name:true,companyId:true}});if(!row)throw fail(404,'Δεν βρέθηκε ενεργό κατάστημα.');return row}
 async function view(companyId,storeId){await ensure();await store(companyId,storeId);const rows=await db.$queryRaw`SELECT "settings",("tokenHash" IS NOT NULL) AS "paired" FROM "ProductionPrinter" WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;const jobs=await db.$queryRaw`SELECT "id","batchId","status","createdAt","claimedAt" FROM "ProductionPrintJob" WHERE "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "createdAt" DESC LIMIT 20`;const products=await db.$queryRaw`SELECT p."id",p."name" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true JOIN "PreparationProductSettings" ps ON ps."productId"=p."id" AND ps."companyId"=p."companyId" AND ps."preparationEnabled"=true WHERE p."companyId"=${companyId} AND p."active"=true ORDER BY p."name" LIMIT 1000`;const lifecycle=await readLifecycleGeneration(db,{companyId,storeId});return{settings:rows[0]?.settings||null,paired:Boolean(rows[0]?.paired),jobs,products,lifecycleGeneration:lifecycle.generation}}
 async function configure(companyId,storeId,input){await ensure();await store(companyId,storeId);const settings=printerSchema.parse(input);await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`production:${companyId}:${storeId}`},0))`;
  const lifecycle=await readLifecycleGeneration(tx,{companyId,storeId});await assertLifecycleMutation(tx,{companyId,storeId},lifecycle.generation);
  const pending=await tx.$queryRaw`SELECT "id" FROM "ProductionPrintJob" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status" IN ('QUEUED','STARTED','UNKNOWN') LIMIT 1`;
  if(pending.length)throw fail(409,'Υπάρχουν εκκρεμείς εκτυπώσεις. Έλεγξέ τες πριν αλλάξεις σύνδεση.');
  const products=await tx.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true JOIN "PreparationProductSettings" ps ON ps."productId"=p."id" AND ps."companyId"=p."companyId" AND ps."preparationEnabled"=true WHERE p."companyId"=${companyId} AND p."active"=true AND p."id"=ANY(${[...new Set(settings.productIds)]}::text[])`;
  if(products.length!==new Set(settings.productIds).size)throw fail(400,'Επίλεξε μόνο ενεργά είδη παρασκευής του καταστήματος.');
  await tx.$executeRaw`INSERT INTO "ProductionPrinter" ("companyId","storeId","settings","lifecycleGeneration") VALUES (${companyId},${storeId},${JSON.stringify(settings)}::jsonb,${lifecycle.generation}) ON CONFLICT ("storeId") DO UPDATE SET "settings"=EXCLUDED."settings","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","tokenHash"=NULL,"pairHash"=NULL,"pairUntil"=NULL,"updatedAt"=NOW() WHERE "ProductionPrinter"."companyId"=EXCLUDED."companyId"`;
 });return view(companyId,storeId)}
 async function pairing(companyId,storeId){await ensure();await store(companyId,storeId);const code=crypto.randomBytes(24).toString('hex');const n=await db.$executeRaw`UPDATE "ProductionPrinter" SET "pairHash"=${hash(code)},"pairUntil"=NOW()+INTERVAL '10 minutes' WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "tokenHash" IS NULL`;if(!n)throw fail(409,'Αποθήκευσε πρώτα τη σύνδεση. Υπάρχουσα ζεύξη δεν αντικαθίσταται.');return{code,expiresIn:600}}
 async function pair(code){await ensure();if(!/^[a-f0-9]{48}$/.test(String(code)))throw fail(401,'Μη έγκυρος κωδικός ζεύξης.');const token=crypto.randomBytes(32).toString('hex');const rows=await db.$queryRaw`UPDATE "ProductionPrinter" SET "tokenHash"=${hash(token)},"pairHash"=NULL,"pairUntil"=NULL WHERE "pairHash"=${hash(code)} AND "pairUntil">NOW() AND "tokenHash" IS NULL RETURNING "companyId","storeId"`;if(!rows.length)throw fail(401,'Ο κωδικός ζεύξης έληξε ή χρησιμοποιήθηκε.');return{token,storeId:rows[0].storeId}}
 async function device(token){await ensure();if(!/^[a-f0-9]{64}$/.test(String(token)))throw fail(401,'Μη έγκυρη σύνδεση εκτυπωτή.');const rows=await db.$queryRaw`SELECT "companyId","storeId","settings","lifecycleGeneration" FROM "ProductionPrinter" WHERE "tokenHash"=${hash(token)}`;const row=rows[0];if(!row)throw fail(401,'Η σύνδεση εκτυπωτή ανακλήθηκε.');await store(row.companyId,row.storeId);await assertLifecycleMutation(db,{companyId:row.companyId,storeId:row.storeId},row.lifecycleGeneration,{lock:false});const state=await moduleState(row.companyId);if(!state?.licenseAllowed||!state.activeModules.includes('STORE_MODE'))throw fail(403,'Η άδεια Store Mode δεν είναι ενεργή.');return row}
 async function claim(token){const row=await device(token);if(!row.settings.enabled)return{job:null};const claimId=crypto.randomUUID();const jobs=await db.$queryRaw`UPDATE "ProductionPrintJob" SET "status"='STARTED',"claimId"=${claimId},"claimedBy"=${hash(token)},"claimedAt"=NOW() WHERE "id"=(SELECT "id" FROM "ProductionPrintJob" WHERE "companyId"=${row.companyId} AND "storeId"=${row.storeId} AND "status"='QUEUED' AND EXISTS(SELECT 1 FROM "ProductionPrinter" p WHERE p."companyId"=${row.companyId} AND p."storeId"=${row.storeId} AND p."tokenHash"=${hash(token)}) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING "id","ticket"`;return{job:jobs[0]?{...jobs[0],claimId}:null}}
 async function acknowledge(token,id,claimId,status){const row=await device(token);if(!['WRITTEN','UNKNOWN'].includes(status)||!z.string().uuid().safeParse(id).success||!z.string().uuid().safeParse(claimId).success)throw fail(400,'Μη έγκυρο αποτέλεσμα εκτύπωσης.');const n=await db.$executeRaw`UPDATE "ProductionPrintJob" SET "status"=${status},"finishedAt"=NOW() WHERE "id"=${id} AND "companyId"=${row.companyId} AND "storeId"=${row.storeId} AND "claimId"=${claimId} AND "claimedBy"=${hash(token)} AND "status" IN ('STARTED',${status})`;if(!n)throw fail(409,'Η εκτύπωση δεν ανήκει σε αυτή τη σύνδεση.');return{ok:true}}
 async function resolve(companyId,storeId,actorId,id,input){
  await ensure();await store(companyId,storeId);
  const body=z.object({status:z.enum(['VERIFIED_PRINTED','CANCELLED']),reason:z.string().trim().min(5).max(500)}).parse(input);
  return db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`production:${companyId}:${storeId}`},0))`;
   const rows=await tx.$queryRaw`UPDATE "ProductionPrintJob" SET "status"=${body.status},"finishedAt"=NOW() WHERE "id"=${id} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "status" IN ('STARTED','UNKNOWN') RETURNING "id"`;
   if(!rows.length)throw fail(409,'Επιτρέπεται έλεγχος μόνο αβέβαιης εκτύπωσης.');
   await tx.$executeRaw`INSERT INTO "ProductionPrintResolution" ("jobId","companyId","storeId","actorId","reason","status") VALUES (${id},${companyId},${storeId},${actorId},${body.reason},${body.status})`;
   return{ok:true};
  });
 }
 async function dispatch({companyId,storeId,requestId,body,products,operatorName,operatorId,validate}){
  await ensure();const fingerprint=hash(JSON.stringify(body));return db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`production:${companyId}:${storeId}`},0))`;
   if(requestId){const previous=await tx.$queryRaw`SELECT "fingerprint","response" FROM "ProductionPrintRequest" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "requestId"=${requestId}`;if(previous[0]){if(previous[0].fingerprint!==fingerprint)throw fail(409,'Η ίδια αποστολή έχει διαφορετικά είδη.');return{...previous[0].response,replayed:true}}}
   await assertLifecycleMutation(tx,{companyId,storeId},body.lifecycleGeneration);
   await validate(tx);
   const rows=await tx.$queryRaw`SELECT "settings",("tokenHash" IS NOT NULL) AS "paired" FROM "ProductionPrinter" WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;const printer=rows[0];
   if(printer?.settings.enabled&&!requestId)throw fail(409,'Ανανέωσε το POS πριν από την αποστολή παραγωγής.');
   if(printer?.settings.enabled&&!printer.paired)throw fail(409,'Ο εκτυπωτής δεν έχει συνδεθεί ακόμη.');
   const id=crypto.randomUUID();
   await tx.$executeRaw`INSERT INTO "StorePreparationBatch" ("id","companyId","storeId","operatorId","operatorName","productionStation","priority","note","itemsJson","status") VALUES (${id},${companyId},${storeId},${operatorId},${operatorName},${body.productionStation},${body.priority},${body.note||null},${JSON.stringify(body.items)}::jsonb,'SENT')`;
   let printStatus='BROWSER',jobId=null;
   if(printer?.settings.enabled){const ids=new Set(printer.settings.productIds),items=body.items.filter(p=>ids.has(p.productId));printStatus='NO_MATCH';if(items.length){jobId=crypto.randomUUID();const ticket={settings:printer.settings,batchId:id,priority:body.priority,operatorName:printableText(operatorName),items:productionTicket(items,products)};await tx.$executeRaw`INSERT INTO "ProductionPrintJob" ("id","companyId","storeId","batchId","ticket") VALUES (${jobId},${companyId},${storeId},${id},${JSON.stringify(ticket)}::jsonb)`;printStatus='QUEUED'}}
   const response={ok:true,id,batchId:id,status:'SENT',itemCount:body.items.reduce((s,p)=>s+p.quantity,0),productionStation:body.productionStation,priority:body.priority,printStatus,jobId};
   if(requestId)await tx.$executeRaw`INSERT INTO "ProductionPrintRequest" ("companyId","storeId","requestId","fingerprint","batchId","response") VALUES (${companyId},${storeId},${requestId},${fingerprint},${id},${JSON.stringify(response)}::jsonb)`;
   return response;
  });
 }
 return{ensure,view,configure,pairing,pair,claim,acknowledge,dispatch,resolve};
}
