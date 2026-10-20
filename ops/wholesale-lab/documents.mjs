// Disposable simulation only. This module is never imported by production startup.
import crypto from 'node:crypto';
import {authenticateWholesaleSellerManager} from '../../server/src/lib/wholesale-seller-auth.js';

export const DOCUMENT_TYPES=['INVOICE','DELIVERY_NOTE','INVOICE_DELIVERY','CREDIT_NOTE','RETURN_NOTE'];
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&value===value.trim();
export function labError(status,code,message){return Object.assign(new Error(message),{status,code})}
export function fixedUnits(value,scale){
  if(typeof value!=='string'||value.length>35||!new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${scale}})?$`).test(value))throw labError(400,'LAB_DECIMAL_INVALID','Χρησιμοποίησε ακριβή θετικό δεκαδικό αριθμό.');
  const [whole,fraction='']=value.split('.'),n=BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0'));
  if(n>999999999999999999n)throw labError(400,'LAB_DECIMAL_TOO_LARGE','Το ποσό υπερβαίνει το όριο δοκιμής.');return n;
}
export function formatUnits(n,scale){n=BigInt(n);const sign=n<0n?'-':'';if(n<0n)n=-n;const d=10n**BigInt(scale);return `${sign}${n/d}.${String(n%d).padStart(scale,'0')}`}
export function validateFrozenSnapshot(order){
  const q=typeof order.snapshot==='string'?JSON.parse(order.snapshot):structuredClone(order.snapshot);
  if(!q||q.currency!=='EUR'||q.storeId!==order.storeId||q.customerId!==order.customerId||!Array.isArray(q.items)||!q.items.length||q.items.length>100)throw labError(409,'LAB_SNAPSHOT_INVALID','Το αποθηκευμένο αίτημα απαιτεί έλεγχο.');
  const seen=new Set();let net=0n,vat=0n,gross=0n;
  for(const line of q.items){
    if(!id(line.productId)||seen.has(line.productId)||fixedUnits(line.quantity,4)<=0n)throw labError(409,'LAB_SNAPSHOT_INVALID','Μη έγκυρες γραμμές αιτήματος.');seen.add(line.productId);
    const n=fixedUnits(line.netTotal,2),v=fixedUnits(line.vatTotal,2),g=fixedUnits(line.grossTotal,2);
    if(n+v!==g)throw labError(409,'LAB_SNAPSHOT_INVALID','Ασυμφωνία ποσών γραμμής.');net+=n;vat+=v;gross+=g;
  }
  if(fixedUnits(q.totals?.net,2)!==net||fixedUnits(q.totals?.vat,2)!==vat||fixedUnits(q.totals?.gross,2)!==gross||fixedUnits(String(order.netTotal),2)!==net||fixedUnits(String(order.vatTotal),2)!==vat||fixedUnits(String(order.grossTotal),2)!==gross)throw labError(409,'LAB_SNAPSHOT_INVALID','Ασυμφωνία συνόλων αιτήματος.');
  return q;
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=body=>crypto.createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
const invoice=t=>['INVOICE','INVOICE_DELIVERY'].includes(t),delivery=t=>['DELIVERY_NOTE','INVOICE_DELIVERY'].includes(t);
const required=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw labError(400,'LAB_INPUT_INVALID','Μη έγκυρη αίτηση δοκιμής.')};
function requestKey(value){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(value))throw labError(400,'LAB_REQUEST_ID_REQUIRED','Απαιτείται μοναδικό αναγνωριστικό δοκιμής.');return value}

export async function ensureLabDocumentsSchema(db,assertIsolated){
  if(typeof assertIsolated!=='function')throw labError(503,'LAB_ISOLATION_REQUIRED','Απαιτείται επαληθευμένο απομονωμένο περιβάλλον.');
  await db.$transaction(async tx=>{
    await assertIsolated(tx);
    const ddl=[
      'CREATE TABLE IF NOT EXISTS "LabDocument" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"orderId" TEXT NOT NULL,"customerId" TEXT NOT NULL,"type" TEXT NOT NULL,"referenceId" TEXT,"body" JSONB NOT NULL,"actorId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())',
      'CREATE TABLE IF NOT EXISTS "LabCancellation" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"documentId" TEXT NOT NULL UNIQUE REFERENCES "LabDocument"("id"),"actorId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())',
      'CREATE TABLE IF NOT EXISTS "LabStockEntry" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,"quantityUnits" BIGINT NOT NULL,"documentId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())',
      'CREATE TABLE IF NOT EXISTS "LabReceivableEntry" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"customerId" TEXT NOT NULL,"amountCents" BIGINT NOT NULL,"documentId" TEXT,"paymentId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())',
      'CREATE TABLE IF NOT EXISTS "LabPayment" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"invoiceId" TEXT NOT NULL REFERENCES "LabDocument"("id"),"customerId" TEXT NOT NULL,"amountCents" BIGINT NOT NULL CHECK("amountCents">0),"method" TEXT NOT NULL CHECK("method" IN (\'CASH\',\'BANK\',\'CARD\')),"actorId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())',
      'CREATE TABLE IF NOT EXISTS "LabEvent" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"kind" TEXT NOT NULL,"details" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())',
      'CREATE TABLE IF NOT EXISTS "LabRequest" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"requestId" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"response" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY("companyId","storeId","requestId"))',
      'CREATE INDEX IF NOT EXISTS "LabDocument_scope" ON "LabDocument" ("companyId","storeId","orderId")',
      'CREATE INDEX IF NOT EXISTS "LabStockEntry_scope" ON "LabStockEntry" ("companyId","storeId","productId")'
    ];
    for(const sql of ddl)await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION lab_deny_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LAB ledger is append-only'; END $$`);
    for(const table of ['LabDocument','LabCancellation','LabStockEntry','LabReceivableEntry','LabPayment','LabEvent','LabRequest']){
      await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "LabAppendOnly" ON "${table}"`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER "LabAppendOnly" BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION lab_deny_ledger_mutation()`);
    }
  },{timeout:15000});
}
export function createLabDocumentEngine({db,assertIsolated}){
  if(!db||typeof assertIsolated!=='function')throw labError(503,'LAB_ISOLATION_REQUIRED','Απαιτείται απομονωμένη βάση δοκιμών.');
  async function authorize(tx,user,storeId){
    await assertIsolated(tx);
    if(!id(storeId)||user?.supportContext)throw labError(403,'LAB_SCOPE_REQUIRED','Απαιτείται προσωπική σύνδεση και συγκεκριμένο κατάστημα.');
    await authenticateWholesaleSellerManager(tx,user,{lock:true});
    const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${user.companyId} AND "active"=true FOR SHARE`;
    const users=await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} AND "companyId"=${user.companyId} FOR SHARE`;
    if(!stores[0]||!users[0])throw labError(404,'LAB_SCOPE_NOT_FOUND','Το κατάστημα δοκιμής δεν είναι διαθέσιμο.');
  }
  async function transaction(user,storeId,work){return db.$transaction(async tx=>{
    await assertIsolated(tx);await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['wholesale-lab',user?.companyId,storeId])},0))::text AS locked`;
    await authorize(tx,user,storeId);const result=await work(tx);await authorize(tx,user,storeId);return result;
  },{isolationLevel:'ReadCommitted',timeout:15000,maxWait:5000})}
  async function replay(tx,user,body,work){
    requestKey(body.requestId);const hash=fingerprint({actorId:user.id,...body});
    const prior=await tx.$queryRaw`SELECT "fingerprint","response" FROM "LabRequest" WHERE "companyId"=${user.companyId} AND "storeId"=${body.storeId} AND "requestId"=${body.requestId}`;
    if(prior[0]){if(prior[0].fingerprint!==hash)throw labError(409,'LAB_IDEMPOTENCY_CONFLICT','Το κλειδί έχει ήδη χρησιμοποιηθεί με διαφορετικά στοιχεία.');return {...prior[0].response,replayed:true}}
    const response={testOnly:true,...await work()};
    await tx.$executeRaw`INSERT INTO "LabRequest" ("companyId","storeId","requestId","fingerprint","response") VALUES (${user.companyId},${body.storeId},${body.requestId},${hash},${JSON.stringify(response)}::jsonb)`;
    return {...response,replayed:false};
  }
  async function event(tx,user,storeId,kind,details){await tx.$executeRaw`INSERT INTO "LabEvent" ("id","companyId","storeId","actorId","kind","details") VALUES (${crypto.randomUUID()},${user.companyId},${storeId},${user.id},${kind},${JSON.stringify({testOnly:true,...details})}::jsonb)`}
  async function documents(tx,user,storeId){const rows=await tx.$queryRaw`SELECT d.*,c."id" AS "cancellationId" FROM "LabDocument" d LEFT JOIN "LabCancellation" c ON c."documentId"=d."id" WHERE d."companyId"=${user.companyId} AND d."storeId"=${storeId} ORDER BY d."createdAt",d."id"`;return rows.map(dto)}
  function dto(row){return {...row.body,id:row.id,number:`TEST-${row.type}-${row.id.slice(0,8)}`,companyId:row.companyId,storeId:row.storeId,orderId:row.orderId,customerId:row.customerId,type:row.type,referenceId:row.referenceId,status:row.cancellationId?'CANCELLED':'ISSUED',createdAt:new Date(row.createdAt).toISOString(),testOnly:true}}
  async function stock(tx,user,storeId,productId){const rows=await tx.$queryRaw`SELECT COALESCE(SUM("quantityUnits"),0)::text AS "units" FROM "LabStockEntry" WHERE "companyId"=${user.companyId} AND "storeId"=${storeId} AND "productId"=${productId}`;return BigInt(rows[0].units)}
  async function effects(tx,user,doc,sign=1n){
    const out=delivery(doc.type)?-1n:doc.type==='RETURN_NOTE'?1n:0n;
    if(out)for(const line of doc.snapshot.items){const delta=out*sign*fixedUnits(line.quantity,4);if(await stock(tx,user,doc.storeId,line.productId)+delta<0n)throw labError(409,'LAB_STOCK_INSUFFICIENT','Ανεπαρκές εικονικό απόθεμα.');await tx.$executeRaw`INSERT INTO "LabStockEntry" ("id","companyId","storeId","productId","quantityUnits","documentId") VALUES (${crypto.randomUUID()},${user.companyId},${doc.storeId},${line.productId},${delta},${doc.id})`}
    const amount=(invoice(doc.type)?1n:doc.type==='CREDIT_NOTE'?-1n:0n)*sign*fixedUnits(doc.grossTotal,2);
    if(amount)await tx.$executeRaw`INSERT INTO "LabReceivableEntry" ("id","companyId","storeId","customerId","amountCents","documentId") VALUES (${crypto.randomUUID()},${user.companyId},${doc.storeId},${doc.customerId},${amount},${doc.id})`;
  }
  async function paid(tx,user,doc){const rows=await tx.$queryRaw`SELECT COALESCE(SUM("amountCents"),0)::text AS "cents" FROM "LabPayment" WHERE "companyId"=${user.companyId} AND "storeId"=${doc.storeId} AND "invoiceId"=${doc.id}`;return BigInt(rows[0].cents)}
  return {
    async seedStock(body){
      required(body,['companyId','storeId','productId','quantity','requestId']);for(const field of ['companyId','storeId','productId'])if(!id(body[field]))throw labError(400,'LAB_INPUT_INVALID','Μη έγκυρη αρχική ποσότητα.');fixedUnits(body.quantity,4);
      return db.$transaction(async tx=>{await assertIsolated(tx);await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['wholesale-lab',body.companyId,body.storeId])},0))::text AS locked`;const user={id:'LAB_FIXTURE',companyId:body.companyId};return replay(tx,user,body,async()=>{const existing=await tx.$queryRaw`SELECT "id" FROM "LabStockEntry" WHERE "companyId"=${body.companyId} AND "storeId"=${body.storeId} AND "productId"=${body.productId} LIMIT 1`;if(existing[0])throw labError(409,'LAB_STOCK_ALREADY_SEEDED','Το αρχικό εικονικό απόθεμα έχει οριστεί.');await tx.$executeRaw`INSERT INTO "LabStockEntry" ("id","companyId","storeId","productId","quantityUnits") VALUES (${crypto.randomUUID()},${body.companyId},${body.storeId},${body.productId},${fixedUnits(body.quantity,4)})`;await event(tx,user,body.storeId,'INITIAL_VIRTUAL_STOCK',body);return {seeded:true}})})
    },
    async issue(user,body){
      required(body,['storeId','orderId','type','requestId','referenceId']);if(!id(body.orderId)||!DOCUMENT_TYPES.includes(body.type)||(body.referenceId!==undefined&&!id(body.referenceId)))throw labError(400,'LAB_INPUT_INVALID','Μη έγκυρος τύπος ή παραγγελία.');
      const normalized={storeId:body.storeId,orderId:body.orderId,type:body.type,referenceId:body.referenceId||null,requestId:body.requestId};
      return transaction(user,body.storeId,tx=>replay(tx,user,normalized,async()=>{
        const rows=await tx.$queryRaw`SELECT * FROM "WholesaleOrderRequest" WHERE "id"=${body.orderId} AND "companyId"=${user.companyId} AND "storeId"=${body.storeId} AND "status"='SUBMITTED' FOR SHARE`;
        if(!rows[0])throw labError(404,'LAB_ORDER_NOT_FOUND','Η δοκιμαστική παραγγελία δεν βρέθηκε.');
        const snapshot=validateFrozenSnapshot(rows[0]),all=await documents(tx,user,body.storeId),active=all.filter(d=>d.orderId===body.orderId&&d.status==='ISSUED');
        if((invoice(body.type)&&active.some(d=>invoice(d.type)))||(delivery(body.type)&&active.some(d=>delivery(d.type))))throw labError(409,'LAB_DOCUMENT_ALREADY_ISSUED','Έχει ήδη εκδοθεί αντίστοιχο εικονικό παραστατικό.');
        if(['CREDIT_NOTE','RETURN_NOTE'].includes(body.type)){
          const ref=active.find(d=>d.id===body.referenceId);
          if(!ref||(body.type==='CREDIT_NOTE'?!invoice(ref.type):!delivery(ref.type)))throw labError(409,'LAB_REFERENCE_INVALID','Απαιτείται ενεργό αρχικό παραστατικό της ίδιας παραγγελίας.');
          if(all.some(d=>d.referenceId===ref.id&&d.type===body.type))throw labError(409,'LAB_REVERSAL_ALREADY_ISSUED','Έχει ήδη εκδοθεί αυτή η αντιστροφή.');
          if(body.type==='CREDIT_NOTE'&&await paid(tx,user,ref)>0n)throw labError(409,'LAB_PAYMENT_REVERSAL_REQUIRED','Πληρωμένο εικονικό τιμολόγιο δεν πιστώνεται σε αυτή τη δοκιμή.');
        }else if(body.referenceId)throw labError(400,'LAB_REFERENCE_UNEXPECTED','Ο τύπος δεν δέχεται αρχικό παραστατικό.');
        const doc={id:crypto.randomUUID(),type:body.type,storeId:body.storeId,orderId:body.orderId,customerId:rows[0].customerId,referenceId:body.referenceId||null,snapshot,netTotal:snapshot.totals.net,vatTotal:snapshot.totals.vat,grossTotal:snapshot.totals.gross,testOnly:true,sellerName:'ΕΙΚΟΝΙΚΗ ΧΟΝΔΡΙΚΗ LAB - ΔΟΚΙΜΗ',customerName:snapshot.customerName};
        const inserted=await tx.$queryRaw`INSERT INTO "LabDocument" ("id","companyId","storeId","orderId","customerId","type","referenceId","body","actorId") VALUES (${doc.id},${user.companyId},${doc.storeId},${doc.orderId},${doc.customerId},${doc.type},${doc.referenceId},${JSON.stringify(doc)}::jsonb,${user.id}) RETURNING *`;
        await effects(tx,user,doc);await event(tx,user,body.storeId,'VIRTUAL_DOCUMENT_ISSUED',{documentId:doc.id,type:doc.type,orderId:doc.orderId,totals:snapshot.totals});return {document:dto(inserted[0])};
      }));
    },
    async cancel(user,documentId,body){
      required(body,['storeId','requestId']);if(!id(documentId))throw labError(400,'LAB_INPUT_INVALID','Μη έγκυρο παραστατικό.');
      return transaction(user,body.storeId,tx=>replay(tx,user,{...body,documentId,operation:'cancel'},async()=>{
        const all=await documents(tx,user,body.storeId),doc=all.find(d=>d.id===documentId);
        if(!doc)throw labError(404,'LAB_DOCUMENT_NOT_FOUND','Το παραστατικό δεν βρέθηκε.');if(doc.status!=='ISSUED')throw labError(409,'LAB_DOCUMENT_CANCELLED','Το παραστατικό έχει ήδη ακυρωθεί.');
        if(all.some(d=>d.referenceId===doc.id&&d.status==='ISSUED')||await paid(tx,user,doc)>0n)throw labError(409,'LAB_DEPENDENCY_EXISTS','Υπάρχει ενεργή αντιστροφή ή εικονική πληρωμή.');
        await effects(tx,user,doc,-1n);await tx.$executeRaw`INSERT INTO "LabCancellation" ("id","companyId","storeId","documentId","actorId") VALUES (${crypto.randomUUID()},${user.companyId},${body.storeId},${doc.id},${user.id})`;await event(tx,user,body.storeId,'VIRTUAL_DOCUMENT_CANCELLED',{documentId:doc.id});return {document:{...doc,status:'CANCELLED'}};
      }));
    },
    async pay(user,body){
      required(body,['storeId','invoiceId','amount','method','requestId']);if(!id(body.invoiceId)||!['CASH','BANK','CARD'].includes(body.method)||fixedUnits(body.amount,2)<=0n)throw labError(400,'LAB_PAYMENT_INVALID','Μη έγκυρη εικονική πληρωμή.');
      const normalized={...body,amount:formatUnits(fixedUnits(body.amount,2),2),operation:'payment'};
      return transaction(user,body.storeId,tx=>replay(tx,user,normalized,async()=>{
        const all=await documents(tx,user,body.storeId),doc=all.find(d=>d.id===body.invoiceId&&d.status==='ISSUED'&&invoice(d.type));
        if(!doc)throw labError(404,'LAB_INVOICE_NOT_FOUND','Το ενεργό τιμολόγιο δεν βρέθηκε.');
        if(all.some(d=>d.referenceId===doc.id&&d.type==='CREDIT_NOTE'&&d.status==='ISSUED'))throw labError(409,'LAB_INVOICE_CREDITED','Το τιμολόγιο έχει πιστωθεί.');
        if(fixedUnits(body.amount,2)+await paid(tx,user,doc)>fixedUnits(doc.grossTotal,2))throw labError(409,'LAB_OVERPAYMENT','Η πληρωμή υπερβαίνει το εικονικό υπόλοιπο.');
        const paymentId=crypto.randomUUID(),rows=await tx.$queryRaw`INSERT INTO "LabPayment" ("id","companyId","storeId","invoiceId","customerId","amountCents","method","actorId") VALUES (${paymentId},${user.companyId},${body.storeId},${doc.id},${doc.customerId},${fixedUnits(body.amount,2)},${body.method},${user.id}) RETURNING "id","invoiceId","method","createdAt"`;
        await tx.$executeRaw`INSERT INTO "LabReceivableEntry" ("id","companyId","storeId","customerId","amountCents","documentId","paymentId") VALUES (${crypto.randomUUID()},${user.companyId},${body.storeId},${doc.customerId},${-fixedUnits(body.amount,2)},${doc.id},${paymentId})`;await event(tx,user,body.storeId,'SIMULATED_PAYMENT',{paymentId,invoiceId:doc.id,amount:normalized.amount,method:body.method});return {payment:{...rows[0],createdAt:new Date(rows[0].createdAt).toISOString(),amount:normalized.amount,testOnly:true}};
      }));
    },
    async state(user,storeId){return transaction(user,storeId,async tx=>{
      const docs=await documents(tx,user,storeId);
      const stocks=await tx.$queryRaw`SELECT e."productId",p."name",SUM(e."quantityUnits")::text AS "units" FROM "LabStockEntry" e LEFT JOIN "Product" p ON p."id"=e."productId" AND p."companyId"=e."companyId" WHERE e."companyId"=${user.companyId} AND e."storeId"=${storeId} GROUP BY e."productId",p."name" ORDER BY e."productId"`;
      const balances=await tx.$queryRaw`SELECT e."customerId",c."name",SUM(e."amountCents")::text AS "cents" FROM "LabReceivableEntry" e LEFT JOIN "WholesaleCustomer" c ON c."id"=e."customerId" AND c."companyId"=e."companyId" WHERE e."companyId"=${user.companyId} AND e."storeId"=${storeId} GROUP BY e."customerId",c."name" ORDER BY e."customerId"`;
      const payments=await tx.$queryRaw`SELECT "id","invoiceId","customerId","amountCents"::text AS "cents","method","createdAt" FROM "LabPayment" WHERE "companyId"=${user.companyId} AND "storeId"=${storeId} ORDER BY "createdAt","id"`;
      const events=await tx.$queryRaw`SELECT "id","actorId","kind","details","createdAt" FROM "LabEvent" WHERE "companyId"=${user.companyId} AND "storeId"=${storeId} ORDER BY "createdAt","id"`;
      return {testOnly:true,storeId,documents:docs,stock:stocks.map(({units,...r})=>({...r,quantity:formatUnits(units,4)})),receivables:balances.map(({cents,...r})=>({...r,balance:formatUnits(cents,2)})),payments:payments.map(({cents,...r})=>({...r,amount:formatUnits(cents,2),testOnly:true})),events};
    })},
    async getDocument(user,storeId,documentId){return transaction(user,storeId,async tx=>{const doc=(await documents(tx,user,storeId)).find(d=>d.id===documentId);if(!doc)throw labError(404,'LAB_DOCUMENT_NOT_FOUND','Το παραστατικό δεν βρέθηκε.');return doc})}
  };
}
