import crypto from 'node:crypto';
import {z} from 'zod';

// StoreProduct.currentStock remains the total inventory used by receipts,
// valuations and the existing ledger. Baking partitions that total; it does
// not manufacture another commercial product or another total-stock receipt.
export const sameProductBakingSchema=z.object({productId:z.string().trim().min(1),quantity:z.number().int().positive().max(100000),idempotencyKey:z.string().uuid(),note:z.string().trim().max(500).default('')}).strict();
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export const sameProductBakingStatements=[
 `CREATE TABLE IF NOT EXISTS "StoreBakedBalance" ("companyId" TEXT NOT NULL REFERENCES "Company"("id"),"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"bakedQuantity" INTEGER NOT NULL DEFAULT 0 CHECK ("bakedQuantity">=0),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("storeId","productId"))`,
 `CREATE TABLE IF NOT EXISTS "StoreBakedBalanceEvent" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"kind" TEXT NOT NULL CHECK ("kind" IN ('BAKE','CONSUME','RESTORE')),"quantity" INTEGER NOT NULL CHECK ("quantity">0),"idempotencyKey" TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"note" TEXT NOT NULL,"totalBefore" NUMERIC NOT NULL,"totalAfter" NUMERIC NOT NULL,"unbakedBefore" NUMERIC NOT NULL,"unbakedAfter" NUMERIC NOT NULL,"bakedBefore" INTEGER NOT NULL,"bakedAfter" INTEGER NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("storeId","idempotencyKey"))`
];
export async function ensureSameProductBakingSchema(db){for(const statement of sameProductBakingStatements)await db.$executeRawUnsafe(statement);await db.$executeRawUnsafe(`ALTER TABLE "StoreBakedBalance" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT FALSE`)}
const integrationReady=new WeakMap();
export async function ensureSameProductBakingIntegrationSchema(db){
 if(integrationReady.has(db))return integrationReady.get(db);
 const ready=prepareIntegration(db);integrationReady.set(db,ready);try{return await ready}catch(error){integrationReady.delete(db);throw error}
}
async function prepareIntegration(db){
 await ensureSameProductBakingSchema(db);
 await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION mws_guard_baked_total() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE baked INTEGER; BEGIN SELECT "bakedQuantity" INTO baked FROM "StoreBakedBalance" WHERE "storeId"=NEW."storeId" AND "productId"=NEW."productId" AND "enabled"=TRUE; IF FOUND AND COALESCE(NEW."currentStock",0)<baked THEN RAISE EXCEPTION 'MWS_BAKED_TOTAL_GUARD' USING ERRCODE='23514'; END IF; RETURN NEW; END $fn$`);
 await db.$executeRawUnsafe(`DO $fn$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='"StoreProduct"'::regclass AND tgname='mws_baked_total_guard') THEN CREATE TRIGGER mws_baked_total_guard BEFORE UPDATE OF "currentStock" ON "StoreProduct" FOR EACH ROW EXECUTE FUNCTION mws_guard_baked_total(); END IF; END $fn$`);
}
export async function maybeChangeSameProductStock(tx,context){
 const tables=await tx.$queryRaw`SELECT CAST(to_regclass('"StoreBakedBalance"') AS TEXT) AS "bakedTable"`;
 if(!tables[0]?.bakedTable)return false;
 await tx.$queryRaw`SELECT CAST(pg_advisory_xact_lock_shared(hashtextextended(${"baking-policy:"+context.companyId+":"+context.storeId+":"+context.productId},0)) AS TEXT)`;
 const rows=await tx.$queryRaw`SELECT "productId" FROM "StoreBakedBalance" WHERE "companyId"=${context.companyId} AND "storeId"=${context.storeId} AND "productId"=${context.productId} AND "enabled"=TRUE`;
 if(!rows.length)return false;
 await changeSameProductBakedStock(tx,{...context,body:{productId:context.productId,quantity:Math.abs(Number(context.quantity)),note:context.note||'',idempotencyKey:context.idempotencyKey||crypto.randomUUID()}});
 return true;
}

// Call within the caller's transaction. The same StoreProduct lock must be
// shared by invoice/stock adjustments and every eventual POS/online consumer.
// Callers must select the explicitly configured state and preserve their own
// fiscal/payment/idempotency gates before entering this stock transaction.
export async function changeSameProductBakedStock(tx,{companyId,storeId,actorId,actorName,kind,body}){
 const value=sameProductBakingSchema.parse(body);
 if(!['BAKE','CONSUME','RESTORE'].includes(kind))throw fail('Μη έγκυρη κίνηση ψημένων.',400);
 if(!actorId||!actorName)throw fail('Απαιτείται ταυτοποιημένος χειριστής.',403);
 const rows=await tx.$queryRaw`SELECT p."id",p."trackStock",p."unit",COALESCE(sp."currentStock",0) AS "totalStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId" WHERE p."id"=${value.productId} AND p."companyId"=${companyId} AND sp."storeId"=${storeId} AND p."active"=TRUE AND sp."active"=TRUE AND s."active"=TRUE ORDER BY p."id" FOR UPDATE OF sp`;
 const product=rows[0];
 if(!product)throw fail('Δεν βρέθηκε ενεργό είδος στο επιλεγμένο κατάστημα.',404);
 if(!product.trackStock||product.unit!=='PIECE')throw fail('Το ψήσιμο απαιτεί είδος με παρακολούθηση αποθέματος σε τεμάχια.',400);
 // Store-wide request identity, including conflicting requests for another SKU.
 await tx.$queryRaw`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${"same-baking-request:"+storeId+":"+value.idempotencyKey},0)) AS TEXT)`;
 const prior=(await tx.$queryRaw`SELECT * FROM "StoreBakedBalanceEvent" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "idempotencyKey"=${value.idempotencyKey}`)[0];
 if(prior){if(prior.productId!==value.productId||prior.kind!==kind||Number(prior.quantity)!==value.quantity||prior.note!==value.note)throw fail('Το αναγνωριστικό χρησιμοποιήθηκε με διαφορετικά στοιχεία.');return {...prior,duplicate:true}}
 await tx.$executeRaw`INSERT INTO "StoreBakedBalance" ("companyId","storeId","productId") VALUES (${companyId},${storeId},${value.productId}) ON CONFLICT ("storeId","productId") DO NOTHING`;
 const balance=(await tx.$queryRaw`SELECT "companyId","bakedQuantity" FROM "StoreBakedBalance" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${value.productId} FOR UPDATE`)[0];
 if(!balance)throw fail('Η ποσότητα ψημένων δεν ανήκει στην επιλεγμένη εταιρεία.');
 const totalBefore=Number(product.totalStock),bakedBefore=Number(balance.bakedQuantity),unbakedBefore=totalBefore-bakedBefore;
 if(!Number.isFinite(totalBefore)||unbakedBefore<0)throw fail('Οι ποσότητες αποθήκης και ψημένων χρειάζονται συμφωνία πριν την κίνηση.');
 if(kind==='BAKE'&&unbakedBefore<value.quantity)throw fail('Δεν υπάρχουν αρκετά άψητα τεμάχια στην αποθήκη.');
 if(kind==='CONSUME'&&bakedBefore<value.quantity)throw fail('Δεν υπάρχουν αρκετά ψημένα τεμάχια.');
 const totalAfter=totalBefore+(kind==='BAKE'?0:kind==='CONSUME'?-value.quantity:value.quantity);
 const bakedAfter=bakedBefore+(kind==='CONSUME'?-value.quantity:value.quantity),unbakedAfter=totalAfter-bakedAfter;
 // CONSUME/RESTORE owns both balances atomically; callers must not deduct or
 // restore StoreProduct a second time. Their normal total-stock movement is
 // still written once by the sale/return/waste flow, never by this partition.
 await tx.$executeRaw`UPDATE "StoreBakedBalance" SET "bakedQuantity"=${bakedAfter},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${value.productId}`;
 if(kind!=='BAKE')await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${totalAfter},"updatedAt"=NOW() WHERE "storeId"=${storeId} AND "productId"=${value.productId}`;
 const id=crypto.randomUUID();
 await tx.$executeRaw`INSERT INTO "StoreBakedBalanceEvent" ("id","companyId","storeId","productId","kind","quantity","idempotencyKey","actorId","actorName","note","totalBefore","totalAfter","unbakedBefore","unbakedAfter","bakedBefore","bakedAfter") VALUES (${id},${companyId},${storeId},${value.productId},${kind},${value.quantity},${value.idempotencyKey},${actorId},${actorName},${value.note},${totalBefore},${totalAfter},${unbakedBefore},${unbakedAfter},${bakedBefore},${bakedAfter})`;
 return {id,...value,kind,totalBefore,totalAfter,unbakedBefore,unbakedAfter,bakedBefore,bakedAfter,duplicate:false};
}
