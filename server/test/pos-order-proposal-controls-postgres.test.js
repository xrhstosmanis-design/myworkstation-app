import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import express from 'express';
import {renderPosOrderProposal} from '../../shared/pos-order-proposal-report.mjs';
const url=process.env.POS_ORDER_PROPOSALS_TEST_DATABASE_URL||process.env.DATABASE_URL;
test('actual POS proposal HTTP/PostgreSQL: Greek date bounds, supplier scope, snapshots and audited mail sink',{skip:!url||process.env.NODE_ENV!=='test',timeout:45000},async t=>{
 const target=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname));assert.match(target.pathname,/_test$/);
 const schema='pos_controls_'+randomUUID().replaceAll('-',''),admin=new PrismaClient({datasourceUrl:url});let db,globalDb,server;const previous=process.env.DATABASE_URL;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);target.searchParams.set('schema',schema);process.env.DATABASE_URL=target.href;db=new PrismaClient({datasourceUrl:target.href});
 const tables={Company:'"id" TEXT PRIMARY KEY,"name" TEXT,"active" BOOLEAN,"licenseStatus" TEXT,"subscriptionEndsAt" TIMESTAMP',CompanyModule:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',Store:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN',StorePaidModule:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"unit" TEXT,"active" BOOLEAN,"trackStock" BOOLEAN',StoreProduct:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"currentStock" NUMERIC,"minStock" NUMERIC,"active" BOOLEAN',Recipe:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"active" BOOLEAN',PreparationRecipeLine:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"automatic" BOOLEAN',Sale:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"source" TEXT,"occurredAt" TIMESTAMP',SaleLine:'"id" TEXT PRIMARY KEY,"saleId" TEXT,"productId" TEXT,"quantity" NUMERIC',PurchaseOrder:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"awaitingInvoice" BOOLEAN',PurchaseOrderLine:'"id" TEXT PRIMARY KEY,"orderId" TEXT,"productId" TEXT,"quantity" NUMERIC,"stockUnitsPerInvoiceUnit" NUMERIC',Employee:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"active" BOOLEAN',StoreOperatorCredential:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"active" BOOLEAN',StoreOperatorProfile:'"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"permissions" JSONB,"posAccess" BOOLEAN'};
  tables.PurchaseOrder+=',"supplierId" TEXT';
  tables.StockMovement='"id" TEXT PRIMARY KEY,"storeId" TEXT,"sourceId" TEXT,"sourceType" TEXT,"movementType" TEXT,"quantity" NUMERIC,"createdAt" TIMESTAMP';
  tables.Supplier='"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"email" TEXT,"active" BOOLEAN';
  tables.PurchaseDocument='"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"status" TEXT,"documentType" TEXT,"documentDate" TIMESTAMP';
  tables.PurchaseDocumentLine='"id" TEXT PRIMARY KEY,"purchaseDocumentId" TEXT,"productId" TEXT,"quantity" NUMERIC';
  tables.AuthAudit='"id" TEXT PRIMARY KEY,"userId" TEXT,"email" TEXT,"event" TEXT,"success" BOOLEAN,"deviceName" TEXT,"userAgent" TEXT,"ipAddress" TEXT,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP';
  for(const [name,columns] of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}" (${columns})`);
  for(const sql of [
   `INSERT INTO "Company" VALUES ('a','A',true,'ACTIVE',NULL),('b','B',true,'ACTIVE',NULL)`,
   `INSERT INTO "Store" VALUES ('a1','a','A1',true),('a2','a','A2',true),('b1','b','B1',true)`,
   `INSERT INTO "CompanyModule" VALUES ('m','a','ORDER_SUGGESTIONS',true,NULL,NULL)`,
   `INSERT INTO "Product" VALUES ('p','a','Water <script>unsafe</script>','WATER','PIECE',true,true),('q','a','Other store supplier item','OTHER','PIECE',true,true),('foreign','b','Foreign','F','PIECE',true,true)`,
   `INSERT INTO "StoreProduct" VALUES ('sp','a1','p',2,5,true),('sq','a1','q',0,2,true),('control','a2','p',99,5,true),('foreign','b1','foreign',50,10,true)`,
   `INSERT INTO "Employee" VALUES ('e','a1',true)`,
   `INSERT INTO "StoreOperatorCredential" VALUES ('op','a','a1','e',true)`,
   `INSERT INTO "StoreOperatorProfile" VALUES ('a','a1','e','{"orderSuggestionsPos":true}',true)`,
   `INSERT INTO "Supplier" VALUES ('sup','a','Local supplier','supplier@example.invalid',true),('other','a','Other store','other@example.invalid',true),('b','b','Foreign supplier','foreign@example.invalid',true),('inactive','a','Inactive','inactive@example.invalid',false)`,
   `INSERT INTO "PurchaseOrder" ("id","companyId","storeId","status","awaitingInvoice","supplierId") VALUES ('receipt','a','a1','FINAL',false,'sup')`,
   `INSERT INTO "StockMovement" VALUES
    ('r1','a1','receipt','PURCHASE_ORDER','PURCHASE',1,'2026-11-12 22:30:00'),
    ('r2','a1','receipt','PURCHASE_ORDER','PURCHASE',1,'2026-11-13 08:00:00'),
    ('r3','a1','receipt','PURCHASE_ORDER','PURCHASE',1,'2026-11-16 08:00:00'),
    ('r4','a1','receipt','PURCHASE_ORDER','PURCHASE',1,'2026-11-19 08:00:00'),
    ('r5','a1','receipt','PURCHASE_ORDER','PURCHASE',1,'2026-11-22 08:00:00'),
    ('other','a2','receipt','PURCHASE_ORDER','PURCHASE',1,'2026-11-24 08:00:00'),
    ('return','a1','receipt','PURCHASE_ORDER','SUPPLIER_RETURN',1,'2026-11-24 08:00:00')`,
   `INSERT INTO "PurchaseDocument" VALUES ('old','a','a1','sup','APPROVED','INVOICE','2025-01-01'),('other','a','a2','other','APPROVED','INVOICE','2025-01-01'),('foreign','b','b1','b','APPROVED','INVOICE','2025-01-01')`,
   `INSERT INTO "PurchaseDocumentLine" VALUES ('d1','old','p',1),('d2','other','q',1),('d3','foreign','foreign',1)`,
   `INSERT INTO "Sale" VALUES ('start','a','a1','COMPLETED','POS','2026-10-31 22:00:00'),('last','a','a1','COMPLETED','POS','2026-11-02 21:59:59.999999'),('end','a','a1','COMPLETED','POS','2026-11-02 22:00:00'),('before','a','a1','COMPLETED','POS','2026-10-31 21:59:59.999999'),('return','a','a1','COMPLETED','POS_REVERSAL','2026-11-01 10:00:00'),('other','a','a2','COMPLETED','POS','2026-11-01 10:00:00'),('foreign','b','b1','COMPLETED','POS','2026-11-01 10:00:00'),('draft','a','a1','DRAFT','POS','2026-11-01 10:00:00'),('waste','a','a1','COMPLETED','WASTE','2026-11-01 10:00:00')`,
   `INSERT INTO "SaleLine" VALUES ('l1','start','p',10),('l2','last','p',10),('l3','end','p',100),('l4','before','p',100),('l5','return','p',4),('l6','other','p',100),('l7','foreign','p',100),('l8','draft','p',100),('l9','waste','p',100)`
  ])await db.$executeRawUnsafe(sql);
  const {createPosOrderSuggestionsRouter}=await import('../src/routes/pos-order-suggestions.js');globalDb=(await import('../src/prisma.js')).prisma;
  const {createPosProposalSnapshots,readPosOrderProposal}=await import('../src/services/pos-order-proposal.js');let dataTimeZone='Europe/Athens',cacheTime=1000,mode='ok',release;const sent=[];
  const snapshots=createPosProposalSnapshots({now:()=>cacheTime});
  const sendMail=async message=>{sent.push(message);if(mode==='failure')throw Error('SMTP timeout');if(mode==='hold')await new Promise(r=>release=r);if(mode==='partial')return {messageId:'<partial@local.invalid>',accepted:['one@example.invalid'],rejected:['two@example.invalid']};return {messageId:'<captured@local.invalid>'}};
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.get('x-actor')==='owner'?{id:'owner',companyId:'a',role:'OWNER'}:{id:'op',operatorId:'op',companyId:'a',storeId:'a1',tokenType:'STORE_OPERATOR',role:'EMPLOYEE',permissions:[]};next()});
  const read=(connection,scope)=>readPosOrderProposal({$transaction:(fn,options)=>connection.$transaction(async tx=>{await tx.$executeRawUnsafe(dataTimeZone==='UTC'?"SET LOCAL TIME ZONE 'UTC'":"SET LOCAL TIME ZONE 'Europe/Athens'");return fn(tx)},options)},scope);
  app.use(createPosOrderSuggestionsRouter({db,read,snapshots,sendMail,clock:()=>new Date('2026-11-25T12:00:00Z')}));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}`;
  const get=path=>fetch(root+path),post=(path,body,headers={})=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  const path='/stores/a1/proposal?fromDate=2026-11-01&toDate=2026-11-02&coverageDays=3&leadDays=1&supplierId=sup';
  const calculate=async()=>{const r=await get(path),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body};
  const controls=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY p."id") FROM "StoreProduct" p) stocks,(SELECT jsonb_agg(to_jsonb(s) ORDER BY s."id") FROM "Sale" s) sales,(SELECT COUNT(*)::int FROM "PurchaseOrder") purchases`);
  const before=await controls();
  await t.test('old supplier evidence remains usable independently of selected sales dates; exact Greece boundaries and net quantity',async()=>{
   const response=await get('/stores/a1/suppliers'),suppliers=await response.json();
   assert.equal(response.status,200,JSON.stringify(suppliers));
   assert.deepEqual(suppliers.suppliers.map(s=>s.id),['sup']);
   assert.deepEqual(suppliers.suppliers[0].receiptCadence,{coverageDays:3,receiptDays:4,latestReceipt:'2026-11-22'});
   const r=await calculate();assert.equal(r.rows.length,1);assert.equal(r.rows[0].productId,'p');assert.equal(r.rows[0].soldQuantity,20);assert.equal(r.rows[0].returnedQuantity,4);assert.equal(r.rows[0].netQuantity,16);assert.equal(r.rows[0].suggestedQuantity,30);assert.equal(r.options.historyDays,2);assert.equal(r.period.timeZone,'Europe/Athens');assert.equal(r.supplier.id,'sup');
   dataTimeZone='UTC';const utc=await calculate();assert.deepEqual(utc.rows,r.rows);dataTimeZone='Europe/Athens';
   for(const supplier of ['other','b','inactive'])assert.equal((await get(path.replace('supplierId=sup','supplierId='+supplier))).status,404);
   assert.equal((await get(path.replace('2026-11-01','2026-02-30'))).status,400);assert.equal((await get('/stores/a2/suppliers')).status,403);
  });
  await t.test('mail uses the displayed snapshot even after later calculations; duplicate send is rejected and audited',async()=>{
   const report=await calculate(),expected=renderPosOrderProposal(report,'WATER');await calculate();
   const response=await post('/stores/a1/email',{reportId:report.reportId,recipients:'One@example.invalid, one@example.invalid',search:'WATER'});assert.equal(response.status,200,await response.clone().text());
   assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['one@example.invalid']);assert.equal(sent[0].html,expected.html);assert.equal(sent[0].text,expected.text);assert.ok(!sent[0].html.includes('<script>'));assert.ok(sent[0].text.includes('30 τεμ.'));
   assert.equal((await post('/stores/a1/email',{reportId:report.reportId,recipients:'other@example.invalid'})).status,409);assert.equal(sent.length,1);
   const rows=await db.authAudit.findMany();assert.equal(rows.length,1);assert.equal(rows[0].success,true);assert.equal(rows[0].event,'POS_ORDER_PROPOSAL_EMAIL_ACCEPTED');
  });
  await t.test('partial SMTP acceptance is explicit and cannot repeat the accepted recipients',async()=>{
   mode='partial';const report=await calculate();const response=await post('/stores/a1/email',{reportId:report.reportId,recipients:'one@example.invalid, two@example.invalid'}),body=await response.json();
   assert.equal(response.status,200);assert.equal(body.status,'PARTIAL');assert.deepEqual(body.accepted,['one@example.invalid']);assert.deepEqual(body.rejected,['two@example.invalid']);
   const count=sent.length;assert.equal((await post('/stores/a1/email',{reportId:report.reportId,recipients:'two@example.invalid'})).status,409);assert.equal(sent.length,count);mode='ok';
  });
  await t.test('snapshot identity, expiry and input validation deny without outbound SMTP',async()=>{
   let r=await calculate();const count=sent.length;
   assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:'owner@example.invalid'},{'x-actor':'owner'})).status,409);
   assert.equal((await post('/stores/a2/email',{reportId:r.reportId,recipients:'other@example.invalid'})).status,403);
   assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:'bad\r\nBcc:test@example.invalid'})).status,400);
   assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:''})).status,400);
   cacheTime+=600001;assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:'one@example.invalid'})).status,409);assert.equal(sent.length,count);
  });
  await t.test('concurrent duplicate and unconfirmed SMTP cannot trigger automatic repeat',async()=>{
   mode='hold';let r=await calculate();const first=post('/stores/a1/email',{reportId:r.reportId,recipients:'one@example.invalid'});
   for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(release);
   assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:'one@example.invalid'})).status,409);release();release=null;assert.equal((await first).status,200);
   mode='failure';r=await calculate();const count=sent.length;assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:'one@example.invalid'})).status,502);
   assert.equal((await post('/stores/a1/email',{reportId:r.reportId,recipients:'one@example.invalid'})).status,409);assert.equal(sent.length,count+1);mode='ok';
  });
  await t.test('operator or license revocation after pending audit prevents SMTP',async()=>{
   await db.$executeRawUnsafe(`CREATE FUNCTION revoke_proposal_mail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."event"='POS_ORDER_PROPOSAL_EMAIL_PENDING' THEN IF NEW."deviceName" LIKE '%revoke@example.invalid%' THEN UPDATE "StoreOperatorProfile" SET "permissions"='{}'::jsonb; END IF; IF NEW."deviceName" LIKE '%module@example.invalid%' THEN UPDATE "CompanyModule" SET "active"=FALSE; END IF; END IF; RETURN NEW; END $$`);
   await db.$executeRawUnsafe(`CREATE TRIGGER revoke_mail BEFORE INSERT ON "AuthAudit" FOR EACH ROW EXECUTE FUNCTION revoke_proposal_mail()`);
   const count=sent.length;
   for(const recipient of ['revoke@example.invalid','module@example.invalid']){const report=await calculate();assert.equal((await post('/stores/a1/email',{reportId:report.reportId,recipients:recipient})).status,403);await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "permissions"='{"orderSuggestionsPos":true}'::jsonb`);await db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=TRUE`)}
   assert.equal(sent.length,count);
  });
  assert.equal(await controls(),before);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));if(globalDb)await globalDb.$disconnect();if(db)await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;
 }
});
