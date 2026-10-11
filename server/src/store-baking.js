import {ensureSameProductBakingIntegrationSchema} from './store-baking-same-product.js';
import crypto from 'node:crypto';
import {z} from 'zod';

export const bakingPolicySchema=z.object({mode:z.enum(['ALWAYS','STOCK','BAKED','BAKED_SAME']),sourceProductId:z.string().trim().min(1).nullable().default(null)}).strict().superRefine((v,c)=>{if((v.mode==='BAKED')!==Boolean(v.sourceProductId))c.addIssue({code:'custom',message:'Το ψημένο είδος απαιτεί σύνδεση με άψητο είδος.'})});
export const bakingEntrySchema=z.object({productId:z.string().min(1),sourceProductId:z.string().min(1),quantity:z.number().int().positive().max(100000),idempotencyKey:z.string().uuid(),note:z.string().trim().max(500).default('')}).strict();
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export const bakingSchemaStatements=[
 `CREATE TABLE IF NOT EXISTS "StoreBakingPolicy" ("companyId" TEXT NOT NULL REFERENCES "Company"("id"),"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"mode" TEXT NOT NULL CHECK ("mode" IN ('ALWAYS','STOCK','BAKED')),"sourceProductId" TEXT REFERENCES "Product"("id"),"updatedBy" TEXT NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("storeId","productId"),CHECK (("mode"='BAKED')=("sourceProductId" IS NOT NULL)),CHECK ("sourceProductId" IS NULL OR "sourceProductId"<>"productId"))`,
 `CREATE TABLE IF NOT EXISTS "StoreBakingEntry" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"sourceProductId" TEXT NOT NULL REFERENCES "Product"("id"),"quantity" INTEGER NOT NULL CHECK ("quantity">0),"idempotencyKey" TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"note" TEXT NOT NULL,"sourceBefore" NUMERIC NOT NULL,"sourceAfter" NUMERIC NOT NULL,"finishedBefore" NUMERIC NOT NULL,"finishedAfter" NUMERIC NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("storeId","idempotencyKey"))`
];
export async function ensureStoreBakingSchema(db){for(const sql of bakingSchemaStatements)await db.$executeRawUnsafe(sql);await ensureSameProductBakingIntegrationSchema(db)}
export function policyAvailable(product,quantity=1){return product?.availabilityMode==='ALWAYS'?true:['STOCK','BAKED','BAKED_SAME'].includes(product?.availabilityMode)?Number(product.currentStock||0)>=quantity:null}
export async function readBakingPolicy(tx,companyId,storeId,productId){
 await tx.$queryRaw`SELECT CAST(pg_advisory_xact_lock_shared(hashtextextended(${"baking-policy:"+companyId+":"+storeId+":"+productId},0)) AS TEXT)`;
 const policy=(await tx.$queryRaw`SELECT "mode","sourceProductId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId} FOR SHARE`)[0]||null;
 if(policy?.mode==='STOCK'){
  const tables=await tx.$queryRaw`SELECT CAST(to_regclass('"StoreBakedBalance"') AS TEXT) AS "bakedTable"`;
  if(tables[0]?.bakedTable&&(await tx.$queryRaw`SELECT "productId" FROM "StoreBakedBalance" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId} AND "enabled"=TRUE`).length)return {mode:'BAKED_SAME',sourceProductId:null};
 }
 return policy}
export async function saveBakingPolicy(tx,{companyId,storeId,productId,actorId,body}){
 const value=bakingPolicySchema.parse(body);
 const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} AND "active"=TRUE FOR UPDATE`;
 if(!stores.length)throw fail("Δεν βρέθηκε ενεργό κατάστημα.",404);
 if(value.sourceProductId===productId)throw fail('Το άψητο και το ψημένο πρέπει να είναι διαφορετικά είδη.',400);
 await tx.$queryRaw`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${"baking-policy:"+companyId+":"+storeId+":"+productId},0)) AS TEXT)`;
 const ids=[productId,...(value.sourceProductId?[value.sourceProductId]:[])];
 await tx.$queryRaw`SELECT "productId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId} FOR UPDATE`;
 if(value.mode==='BAKED'){const chained=await tx.$queryRaw`SELECT "productId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "mode"='BAKED' AND ("productId"=${value.sourceProductId} OR "sourceProductId"=${productId})`;if(chained.length)throw fail("Το άψητο είδος δεν μπορεί να είναι άλλο ψημένο είδος.",400)}
 const rows=await tx.$queryRaw`SELECT p."id",p."trackStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId" WHERE p."companyId"=${companyId} AND s."id"=${storeId} AND s."active"=TRUE AND p."active"=TRUE AND sp."active"=TRUE AND p."id"=ANY(${ids}::text[]) ORDER BY p."id" FOR UPDATE OF sp`;
 if(rows.length!==ids.length)throw fail('Τα είδη πρέπει να είναι ενεργά στο επιλεγμένο κατάστημα.',404);
 if(value.mode==='STOCK'){const recipes=await tx.$queryRaw`SELECT "productId" FROM "PreparationRecipeLine" WHERE "companyId"=${companyId} AND "productId"=${productId} AND "automatic"=TRUE LIMIT 1`;if(recipes.length)throw fail("Το είδος έχει συνταγή. Επιλέξτε πάντα διαθέσιμο για ροφήματα ή σύνδεση ψησίματος για ψημένα είδη.",400)}
 if(value.mode!=='ALWAYS'&&rows.some(r=>!r.trackStock))throw fail('Άψητο και ψημένο είδος πρέπει να παρακολουθούν απόθεμα.',400);
 const balance=(await tx.$queryRaw`SELECT "bakedQuantity","enabled" FROM "StoreBakedBalance" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId} FOR UPDATE`)[0];
 if(value.mode!=='BAKED_SAME'&&Number(balance?.bakedQuantity)>0)throw fail('Καταγράψτε πρώτα πώληση ή φύρα των ψημένων πριν αλλάξετε τον κανόνα.');
 if(value.mode==='BAKED_SAME'){
  const details=(await tx.$queryRaw`SELECT p."unit",COALESCE(sp."currentStock",0) AS stock FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."id"=${productId} AND p."companyId"=${companyId} AND sp."storeId"=${storeId}`)[0];
  if(details?.unit!=='PIECE'||Number(details.stock)<Number(balance?.bakedQuantity||0))throw fail('Το είδος απαιτεί απόθεμα σε τεμάχια και συμφωνημένες ποσότητες.',400);
  const linked=await tx.$queryRaw`SELECT "productId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "mode"='BAKED' AND ("productId"=${productId} OR "sourceProductId"=${productId})`;
  if(linked.length)throw fail('Αφαιρέστε πρώτα την παλιά σύνδεση με δεύτερο είδος.',400);
  await tx.$executeRaw`INSERT INTO "StoreBakedBalance" ("companyId","storeId","productId","enabled") VALUES (${companyId},${storeId},${productId},TRUE) ON CONFLICT ("storeId","productId") DO UPDATE SET "enabled"=TRUE,"updatedAt"=NOW()`;
 }else await tx.$executeRaw`UPDATE "StoreBakedBalance" SET "enabled"=FALSE,"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId}`;
 const storedMode=value.mode==='BAKED_SAME'?'STOCK':value.mode;
 await tx.$executeRaw`INSERT INTO "StoreBakingPolicy" ("companyId","storeId","productId","mode","sourceProductId","updatedBy") VALUES (${companyId},${storeId},${productId},${storedMode},${value.sourceProductId},${actorId}) ON CONFLICT ("storeId","productId") DO UPDATE SET "mode"=EXCLUDED."mode","sourceProductId"=EXCLUDED."sourceProductId","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
 return value;
}
export async function recordBaking(tx,{companyId,storeId,actorId,actorName,body}){
 const value=bakingEntrySchema.parse(body);
 // Store-scoped serialization makes replay and competing additions deterministic.
 const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} AND "active"=TRUE FOR UPDATE`;
 if(!stores.length)throw fail("Δεν βρέθηκε ενεργό κατάστημα.",404);
 const prior=(await tx.$queryRaw`SELECT * FROM "StoreBakingEntry" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "idempotencyKey"=${value.idempotencyKey}`)[0];
 if(prior){if(prior.productId!==value.productId||prior.sourceProductId!==value.sourceProductId||Number(prior.quantity)!==value.quantity||prior.note!==value.note)throw fail('Το αναγνωριστικό χρησιμοποιήθηκε με διαφορετικά στοιχεία.');return {...prior,duplicate:true}}
 const policy=await readBakingPolicy(tx,companyId,storeId,value.productId);
 if(policy?.mode!=='BAKED'||policy.sourceProductId!==value.sourceProductId)throw fail('Η σύνδεση ψησίματος άλλαξε. Ανανεώστε τα είδη.');
 const rows=await tx.$queryRaw`SELECT p."id",p."trackStock",COALESCE(sp."currentStock",0) AS stock FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."companyId"=${companyId} AND sp."storeId"=${storeId} AND p."active"=TRUE AND sp."active"=TRUE AND p."id"=ANY(${[value.productId,value.sourceProductId]}::text[]) ORDER BY p."id" FOR UPDATE OF sp`;
 if(rows.length!==2||rows.some(r=>!r.trackStock))throw fail('Τα είδη ψησίματος δεν είναι ενεργά με παρακολούθηση αποθέματος.');
 const sourceBefore=Number(rows.find(r=>r.id===value.sourceProductId).stock),finishedBefore=Number(rows.find(r=>r.id===value.productId).stock),quantity=value.quantity;
 if(sourceBefore<quantity)throw fail('Δεν υπάρχουν αρκετά άψητα τεμάχια στην αποθήκη.');
 const id=crypto.randomUUID(),sourceAfter=sourceBefore-quantity,finishedAfter=finishedBefore+quantity;
 await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)+CASE WHEN "productId"=${value.productId} THEN ${quantity} ELSE ${-quantity} END,"updatedAt"=NOW() WHERE "storeId"=${storeId} AND "productId"=ANY(${[value.productId,value.sourceProductId]}::text[]) AND "active"=TRUE`;
 await tx.$executeRaw`INSERT INTO "StoreBakingEntry" ("id","companyId","storeId","productId","sourceProductId","quantity","idempotencyKey","actorId","actorName","note","sourceBefore","sourceAfter","finishedBefore","finishedAfter") VALUES (${id},${companyId},${storeId},${value.productId},${value.sourceProductId},${quantity},${value.idempotencyKey},${actorId},${actorName},${value.note},${sourceBefore},${sourceAfter},${finishedBefore},${finishedAfter})`;
 for(const [productId,delta,kind] of [[value.sourceProductId,-quantity,'BAKING_OUT'],[value.productId,quantity,'BAKING_IN']])await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","sourceType","sourceId","note","createdByUserId","idempotencyKey") VALUES (${crypto.randomUUID()},${storeId},${productId},${kind},${delta},'STORE_BAKING',${id},${`Ψήσιμο · ${actorName} · ${value.note}`},${null},${`baking:${id}:${kind}`})`;
 return {id,...value,sourceBefore,sourceAfter,finishedBefore,finishedAfter,duplicate:false};
}

export async function readStoreBakingState(db,companyId,storeId){
 const [products,history]=await Promise.all([
 db.$queryRaw`SELECT bp."productId",bp."sourceProductId",p."name",p."sku",raw."name" AS "sourceName",COALESCE(sp."currentStock",0) AS "currentStock",COALESCE(rawsp."currentStock",0) AS "sourceStock" FROM "StoreBakingPolicy" bp JOIN "Product" p ON p."id"=bp."productId" AND p."companyId"=bp."companyId" AND p."active"=TRUE JOIN "Product" raw ON raw."id"=bp."sourceProductId" AND raw."companyId"=bp."companyId" AND raw."active"=TRUE JOIN "StoreProduct" sp ON sp."storeId"=bp."storeId" AND sp."productId"=p."id" AND sp."active"=TRUE JOIN "StoreProduct" rawsp ON rawsp."storeId"=bp."storeId" AND rawsp."productId"=raw."id" AND rawsp."active"=TRUE WHERE bp."companyId"=${companyId} AND bp."storeId"=${storeId} AND bp."mode"='BAKED' UNION ALL SELECT b."productId",NULL::text AS "sourceProductId",p."name",p."sku",p."name" AS "sourceName",b."bakedQuantity" AS "currentStock",COALESCE(sp."currentStock",0)-b."bakedQuantity" AS "sourceStock" FROM "StoreBakedBalance" b JOIN "Product" p ON p."id"=b."productId" AND p."companyId"=b."companyId" AND p."active"=TRUE JOIN "StoreProduct" sp ON sp."storeId"=b."storeId" AND sp."productId"=p."id" AND sp."active"=TRUE WHERE b."companyId"=${companyId} AND b."storeId"=${storeId} AND b."enabled"=TRUE ORDER BY "name"`,
 db.$queryRaw`SELECT e.*,p."name" FROM "StoreBakingEntry" e JOIN "Product" p ON p."id"=e."productId" AND p."companyId"=e."companyId" WHERE e."companyId"=${companyId} AND e."storeId"=${storeId} ORDER BY e."createdAt" DESC,e."id" DESC LIMIT 100`
 ]);
 const sameHistory=await db.$queryRaw`SELECT e.*,p."name" FROM "StoreBakedBalanceEvent" e JOIN "Product" p ON p."id"=e."productId" AND p."companyId"=e."companyId" WHERE e."companyId"=${companyId} AND e."storeId"=${storeId} AND e."kind"='BAKE' ORDER BY e."createdAt" DESC,e."id" DESC LIMIT 100`;
 return {storeId,products:products.map(p=>({...p,sameProduct:p.sourceProductId==null})),history:[...history,...sameHistory.map(e=>({...e,sameProduct:true,sourceBefore:e.unbakedBefore,sourceAfter:e.unbakedAfter,finishedBefore:e.bakedBefore,finishedAfter:e.bakedAfter}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,100)};
}
