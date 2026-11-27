import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {readStoreConsumptionFinancialReport,consumptionFinancialFilters} from '../src/services/store-consumption-financial-report.js';
const native=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const wasm=process.env.MWS_FINANCIAL_PGLITE_MODULE;
test('PostgreSQL financial consumption uses net package cost as of event, immutable sale values, disjoint sources and scoped complete totals',{skip:!native()&&!wasm},async()=>{
  let db,admin,pg,schema;
  if(wasm){
    const {PGlite}=await import(wasm);pg=new PGlite();
    db={$executeRawUnsafe:sql=>pg.exec(sql),$queryRaw:async(strings,...values)=>
      (await pg.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values.map(v=>v instanceof Date?v.toISOString():v))).rows};
  }else{
    admin=new PrismaClient();schema='consumption_financial_'+randomUUID().replaceAll('-','');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);db=new PrismaClient({datasourceUrl:url.toString()});
  }
  const exec=async sql=>{for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement)};
  try{
    await exec(`
      CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text);
      CREATE TABLE "User"("id" text,"companyId" text,"fullName" text);
      CREATE TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"name" text,"sku" text,"unit" text,"costPrice" numeric);
      CREATE TABLE "Sale"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"source" text,"status" text,"occurredAt" timestamp);
      CREATE TABLE "SaleLine"("id" text PRIMARY KEY,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric);
      CREATE TABLE "PosSaleActionAudit"("id" text,"companyId" text,"storeId" text,"saleId" text,"actionType" text,"createdAt" timestamp,"actorName" text,"reason" text);
      CREATE TABLE "StockMovement"("id" text,"storeId" text,"productId" text,"createdAt" timestamp,"quantity" numeric,"unitCost" numeric,"createdByUserId" text,"note" text,"movementType" text,"sourceType" text);
      CREATE TABLE "PurchaseDocument"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"documentType" text,"documentDate" timestamp,"createdAt" timestamp);
      CREATE TABLE "PurchaseDocumentLine"("id" text,"purchaseDocumentId" text,"productId" text,"quantity" numeric,"unit" text,"unitsPerPackage" numeric,"netAmount" numeric);
      INSERT INTO "Store" VALUES('s','c'),('other','c'),('foreign','x');
      INSERT INTO "User" VALUES('u','c','Fixture Operator');
      INSERT INTO "Product" VALUES('p','c','CHANGED CURRENT NAME','001','PIECE',999),('missing','c','Missing','002','PIECE',999);
      INSERT INTO "Sale" VALUES
        ('self','c','s','SELF_CONSUMPTION','COMPLETED','2026-11-10 10:00'),
        ('dest','c','s','PRODUCT_DESTRUCTION','COMPLETED','2026-11-10 11:00'),
        ('other','c','other','SELF_CONSUMPTION','COMPLETED','2026-11-10 10:00'),
        ('foreign','x','foreign','SELF_CONSUMPTION','COMPLETED','2026-11-10 10:00'),
        ('early','c','s','SELF_CONSUMPTION','COMPLETED','2026-11-09 21:59:59'),
        ('late','c','s','SELF_CONSUMPTION','COMPLETED','2026-11-10 22:00');
      INSERT INTO "SaleLine" VALUES('selfline','self','p','Recorded water',1.25,2.4),('unknown','self','missing','Unknown cost',1,0),
        ('destline','dest','p','Recorded destruction',2,3),('otherline','other','p','OTHER',99,99),
        ('foreignline','foreign','p','FOREIGN',99,99),('earlyline','early','p','EARLY',99,99),('lateline','late','p','LATE',99,99);
      INSERT INTO "PosSaleActionAudit" VALUES
        ('audit-old','c','s','self','SELF_CONSUMPTION','2026-11-10 10:00','Old','old'),
        ('audit-new','c','s','self','SELF_CONSUMPTION','2026-11-10 10:01','Recorded operator','reason');
      INSERT INTO "StockMovement" VALUES('manual','s','p','2026-11-10 12:00',-2,2,'u','Manual destruction','WASTE','PRODUCT_CARD'),
        ('not-destruction','s','p','2026-11-10 12:00',-50,2,'u','Sale','SALE','POS');
      INSERT INTO "PurchaseDocument" VALUES
        ('purchase','c','s','APPROVED','INVOICE','2026-11-01','2026-11-01'),
        ('backdated','c','s','APPROVED','INVOICE','2026-11-09','2026-11-11'),
        ('credit','c','s','APPROVED','CREDIT_NOTE','2026-11-09','2026-11-09'),
        ('otherstore','c','other','APPROVED','INVOICE','2026-11-09','2026-11-09'),
        ('draft','c','s','DRAFT','INVOICE','2026-11-09','2026-11-09');
      INSERT INTO "PurchaseDocumentLine" VALUES
        ('pkg','purchase','p',2,'PACKAGE',6,12),('back','backdated','p',1,'PIECE',NULL,90),
        ('cr','credit','p',1,'PIECE',NULL,80),('os','otherstore','p',1,'PIECE',NULL,70),('dr','draft','p',1,'PIECE',NULL,60)
    `);
    const before=JSON.stringify(await db.$queryRaw`SELECT * FROM "StockMovement" ORDER BY "id"`);
    const filters=consumptionFinancialFilters({from:'2026-11-10',to:'2026-11-10'}),scope={companyId:'c',storeId:'s',filters};
    const self=await readStoreConsumptionFinancialReport(db,{...scope,report:'self-consumption'});
    assert.deepEqual(self.rows.map(r=>r.name).sort(),['Recorded water','Unknown cost']);
    assert.equal(self.rows.find(r=>r.name==='Recorded water').purchasePrice,1);
    assert.equal(self.rows.find(r=>r.name==='Recorded water').purchaseTotal,1.25);
    assert.equal(self.rows.find(r=>r.name==='Recorded water').operatorName,'Recorded operator');
    assert.equal(self.totalPurchase,null);assert.equal(self.totalSale,3);assert.equal(self.missingPurchase,1);
    assert.doesNotMatch(JSON.stringify(self),/999|CURRENT NAME|FOREIGN|OTHER|EARLY|LATE/);
    const dest=await readStoreConsumptionFinancialReport(db,{...scope,report:'destructions'});
    assert.equal(dest.rows.length,2);assert.equal(dest.totalPurchase,6);assert.equal(dest.totalSale,null);assert.equal(dest.missingSale,1);
    const searched=await readStoreConsumptionFinancialReport(db,{...scope,report:'self-consumption',filters:{...filters,search:'Recorded'}});
    assert.equal(searched.totalPurchase,1.25);assert.equal(searched.totalSale,3);
    assert.equal(JSON.stringify(await db.$queryRaw`SELECT * FROM "StockMovement" ORDER BY "id"`),before);
    await exec(`INSERT INTO "PurchaseDocument" VALUES('invalid','c','s','APPROVED','INVOICE','2026-11-09','2026-11-09'); INSERT INTO "PurchaseDocumentLine" VALUES('bad','invalid','p',1,'PACKAGE',NULL,20),('valid-sibling','invalid','p',1,'PIECE',NULL,2)`);
    assert.equal((await readStoreConsumptionFinancialReport(db,{...scope,report:'self-consumption',filters:{...filters,search:'Recorded'}})).totalPurchase,null);
  }finally{
    if(pg)await pg.close();else{await db?.$disconnect();await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin?.$disconnect()}
  }
});
