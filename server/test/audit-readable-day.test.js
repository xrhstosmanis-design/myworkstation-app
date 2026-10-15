import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {auditReadableRecord,auditActorName} from "../../shared/audit-readable.mjs";
import {validateAuditTimes,enrichAuditSaleItems} from "../src/lib/audit-readable-records.js";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";
test("Greek movement presentation preserves zero values, original evidence and does not invent missing stock baselines or actor",()=>{
 const original={id:"00000000-0000-4000-8000-000000000001",eventType:"STOCK_SALE",sourceType:"StockMovement",actorName:"00000000-0000-4000-8000-000000000002",description:"POS πώληση 00000000-0000-4000-8000-000000000001 · OUT 2",financialDetails:{productName:"ΝΕΡΟ 500ML",quantity:-2}};
 const copy=structuredClone(original),r=auditReadableRecord(original);
 assert.equal(r.eventLabel,"Έξοδος αποθέματος από πώληση");assert.match(r.readableDescription,/ΝΕΡΟ 500ML/);assert.doesNotMatch(r.readableDescription,/[0-9a-f]{8}-|OUT/);assert.match(r.readableFinancials,/Μεταβολή αποθέματος: -2/);assert.match(r.readableFinancials,/δεν αποθηκεύτηκε/);assert.equal(r.readableReason,null);assert.deepEqual(original,copy);
 for(let i=0;i<3;i++)assert.equal(auditActorName(original),"Δεν καταγράφηκε όνομα χειριστή");
 const price=auditReadableRecord({eventType:"PERMANENT_PRICE_CHANGE",eventLabel:"Μόνιμη αλλαγή τιμής",actorName:"Ντίνος",financialDetails:{oldPrice:0,newPrice:1.1,reason:"Νέος τιμοκατάλογος"}});
 assert.match(price.readableFinancials,/0,00.*1,10/);assert.equal(price.readableReason,"Νέος τιμοκατάλογος");assert.equal(price.actorName,"Ντίνος");
 const sale=auditReadableRecord({eventType:"SALE_CARD",eventLabel:"Πώληση με κάρτα",saleItems:[{description:"HELL CLASSIC 250ml",quantity:2,unitPrice:1,lineTotal:2,discount:0}]});assert.match(sale.readableDescription,/HELL CLASSIC 250ml.*Ποσότητα 2.*Τιμή 1,00.*Αξία 2,00/s);
});
test("24-hour Athens search rejects invalid/reversed hours and preserves inclusive minute endpoints",()=>{
 assert.deepEqual(validateAuditTimes({timeFrom:"00:00",timeTo:"23:59"}),{timeFrom:"00:00",timeTo:"23:59"});assert.deepEqual(validateAuditTimes({}),{timeFrom:null,timeTo:null});
 for(const q of [{timeFrom:"24:00"},{timeTo:"12:60"},{timeFrom:"8:00"},{timeFrom:"23:00",timeTo:"02:00"}])assert.throws(()=>validateAuditTimes(q),e=>e.status===400);
});
test("native canonical sale enrichment resolves only the same company/store and stock item, never a foreign actor or sale",{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{const db=f.db;
 await db.$executeRawUnsafe('ALTER TABLE "Product" ADD "sku" text');
 await db.$executeRawUnsafe('CREATE TABLE "Employee"("id" text,"storeId" text,"fullName" text)');
 await db.$executeRawUnsafe('CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"operatorEmployeeId" text)');
 await db.$executeRawUnsafe('CREATE TABLE "SaleLine"("id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"lineTotal" numeric,"discount" numeric,"createdAt" timestamptz DEFAULT NOW())');
 await db.$executeRawUnsafe("INSERT INTO \"Employee\" VALUES('e','s','Ντίνος'),('foreign','other','Ξένος');");
 await db.$executeRawUnsafe("INSERT INTO \"Sale\" VALUES('sale','c','s','e'),('other-sale','other-c','other','foreign');");
 await db.$executeRawUnsafe("INSERT INTO \"SaleLine\"(\"id\",\"saleId\",\"productId\",\"description\",\"quantity\",\"unitPrice\",\"lineTotal\",\"discount\") VALUES('l1','sale','p','ΝΕΡΟ',2,1,2,0),('l2','sale','p2','HELL',1,2,2,0),('foreign','other-sale','p','Μυστικό',1,3,3,0)");
 const rows=[{id:"a",companyId:"c",storeId:"s",saleId:"sale",actorName:"—",sourceType:"StockMovement",productId:"p",financialDetails:{sourceId:"sale"}},{id:"b",companyId:"c",storeId:"s",saleId:"other-sale"}];
 const before=await f.snapshot(),r=await enrichAuditSaleItems(db,rows,{companyId:"c",storeId:"s"});
 assert.equal(r[0].saleItems.length,1);assert.equal(r[0].saleItems[0].description,"ΝΕΡΟ");assert.equal(r[0].actorName,"Ντίνος");assert.equal(r[1].saleItems,undefined);
 assert.equal((await enrichAuditSaleItems(db,[rows[0]],{companyId:"other-c",storeId:"other"}))[0].saleItems,undefined);
 assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});
test("native actual Events SQL applies Athens hours before cap, rejects foreign identity joins and handles both timestamp types and DST",{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{const db=f.db,source=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
 await db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" ADD "sessionId" text,ADD "actorId" text,ADD "actorName" text,ADD "supplierName" text,ADD "subtractFromShift" boolean,ADD "reversedByName" text,ADD "reversalReason" text');
 await db.$executeRawUnsafe('ALTER TABLE "Product" ADD "sku" text');
 await db.$executeRawUnsafe('CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text)');
 await db.$executeRawUnsafe('CREATE TABLE "SaleLine"("saleId" text,"productId" text,"description" text)');
 await db.$executeRawUnsafe('CREATE TABLE "User"("id" text,"companyId" text,"fullName" text)');
 await db.$executeRawUnsafe('CREATE TABLE "StoreOperatorCredential"("id" text,"companyId" text,"storeId" text,"displayName" text)');
 await db.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"terminalPos" text)');
 await db.$executeRawUnsafe("INSERT INTO \"User\" VALUES('foreign','foreign-company','Κρυφό όνομα')");
 await db.$executeRawUnsafe("INSERT INTO \"StoreTransaction\"(\"id\",\"companyId\",\"storeId\",\"type\",\"amount\",\"occurredAt\",\"actorId\") SELECT 'late-'||i,'c','s','SALE_CASH',1,'2026-10-16T17:00:00Z','foreign' FROM generate_series(1,10001) i");
 await db.$executeRawUnsafe("INSERT INTO \"StoreTransaction\"(\"id\",\"companyId\",\"storeId\",\"type\",\"amount\",\"occurredAt\",\"actorId\") VALUES('wanted','c','s','SALE_CASH',2,'2026-10-16T05:59:59Z','foreign'),('outside','c','control','SALE_CASH',2,'2026-10-16T05:59:59Z','foreign')");
 const expression=source.match(/const transactionRows=await (prisma\.\$queryRaw`[\s\S]*?`);/)[1];
 const run=(timeFrom,timeTo)=>new Function("prisma","companyId","storeId","from","to","text","timeFrom","timeTo","return "+expression)(db,"c","s",new Date("2026-10-15T21:00Z"),new Date("2026-10-16T21:00Z"),null,timeFrom,timeTo);
 const rows=await run("08:00","08:59");assert.deepEqual(rows.map(x=>x.id),["wanted"]);assert.equal(rows[0].actorName,null);
 await db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" ALTER "occurredAt" TYPE timestamp USING "occurredAt" AT TIME ZONE \'UTC\'');
 assert.deepEqual((await run("08:00","08:59")).map(x=>x.id),["wanted"]);
 const tz=await db.$queryRaw`SELECT to_char('2026-10-25T00:30Z'::timestamptz AT TIME ZONE 'Europe/Athens','HH24:MI') AS first,to_char('2026-10-25T01:30Z'::timestamptz AT TIME ZONE 'Europe/Athens','HH24:MI') AS second`;assert.equal(tz[0].first,"03:30");assert.equal(tz[0].second,"03:30");
 }finally{await f.close()}
});
