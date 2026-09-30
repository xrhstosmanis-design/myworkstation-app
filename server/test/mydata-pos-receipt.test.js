import assert from "node:assert/strict";
import test from "node:test";
import {findMyDataPurchase,attachMyDataPosReceipt} from "../src/lib/mydata-pos-receipt.js";
const identity={companyId:"company",storeId:"store",supplierId:"supplier",supplierTaxId:"099999999",documentNumber:"42",documentDate:"2026-09-28",totalGross:12.4};
const base={inboundId:"inbound",inboxId:"inbox",mark:"400001",documentNumber:"42",series:"A",issueDate:"2026-09-28",inboundTotal:12.4,documentId:"document",documentStoreId:"store",supplierId:"supplier",documentType:"INVOICE",purchaseNumber:"A 42",documentDate:"2026-09-28",totalGross:12.4,status:"DRAFT",orderId:"order",orderStatus:"NEW",jobId:"job",rawPayload:{},resultJson:{productLines:[{code:"confirmed"}]}};
const page={filename:"photo.jpg",mimeType:"image/jpeg",dataUrl:"data:image/jpeg;base64,fixture",checksum:"photo-checksum"};
const payment={id:"payment",companyId:"company",storeId:"store",supplierId:"supplier",supplierTaxId:"099999999",type:"SUPPLIER_PAYMENT",amount:12.4,invoiceDocumentNumber:"A 42",reversedAt:null};
function fixture(overrides={}){
  const row={...base,...overrides},writes=[],attachments=new Map();let resultJson=structuredClone(row.resultJson);
  const db={async $queryRaw(strings,...values){const sql=strings.join("?");
    if(sql.includes('FROM "MyDataInboundDocument"')){assert.equal(values[0],"company");assert.equal(values[1],"store");assert.equal(values[2],"099999999");return [row]}
    if(sql.includes('FROM "SupplierPaymentAllocation"'))return [];
    if(sql.includes('FROM "PurchaseOrder"'))return [{status:row.orderStatus}];
    if(sql.includes('FROM "PurchaseDocument"'))return [{status:row.status,totalGross:row.totalGross,paymentTransactionId:row.paymentTransactionId,settlementMode:row.settlementMode}];
    if(sql.includes('FROM "StoreTransaction"'))return [payment];
    if(sql.includes('FROM "AiReaderJob"'))return [{resultJson}];
    if(sql.includes('FROM "DocumentAttachment"'))return attachments.has(values[2])?[{id:attachments.get(values[2])}]:[];
    throw new Error(sql);
  },async $executeRaw(strings,...values){const sql=strings.join("?");writes.push({sql,values});
    if(sql.startsWith('INSERT INTO "DocumentAttachment"'))attachments.set(values[6],values[0]);
    if(sql.startsWith('UPDATE "AiReaderJob"'))resultJson={...resultJson,...JSON.parse(values[0])};
    if(sql.startsWith('UPDATE "PurchaseDocument"')){row.settlementMode=values[0];row.paymentTransactionId=values[1]}
  },async $transaction(fn){return fn(db)}};
  return {db,row,writes,getResult:()=>resultJson};
}
test("receipt links the original job/order and one existing payment without replacing reviewed rows",async()=>{
  const f=fixture();const first=await attachMyDataPosReceipt(f.db,identity,[page],payment,{id:"operator"});
  assert.equal(first.purchaseDocumentId,"document");assert.equal(first.jobId,"job");assert.equal(first.stockUpdated,false);
  assert.equal(f.row.paymentTransactionId,"payment");assert.equal(f.row.settlementMode,"PAID");
  assert.deepEqual(f.getResult().productLines,[{code:"confirmed"}]);
  assert.equal(f.writes.some(w=>/PurchaseOrderLine|StockMovement|StoreTransaction|INSERT INTO "PurchaseDocument"|INSERT INTO "AiReaderJob"/.test(w.sql)),false);
  const count=f.writes.length;const replay=await attachMyDataPosReceipt(f.db,identity,[page],payment,{id:"operator"});
  assert.equal(replay.reused,true);assert.equal(f.writes.length,count);
  await assert.rejects(attachMyDataPosReceipt(f.db,identity,[{...page,checksum:"second-photo"}],payment,{id:"operator"}),/δεύτερη υποβολή/);
  assert.equal(f.writes.length,count);
});
test("approved purchase keeps approval and stock while attaching actual POS receipt",async()=>{
  const f=fixture({status:"APPROVED",orderStatus:"INVOICED"});const result=await attachMyDataPosReceipt(f.db,identity,[page],payment,{id:"operator"});
  assert.equal(result.awaitingApproval,false);assert.equal(f.row.status,"APPROVED");assert.equal(f.row.orderStatus,"INVOICED");
  assert.equal(f.writes.some(w=>/StockMovement|"status"=/.test(w.sql)),false);
});
test("credit receipt cannot masquerade as payment and second receipt does not pay it",async()=>{
  const f=fixture();await attachMyDataPosReceipt(f.db,identity,[page],null,{id:"operator"});assert.equal(f.row.settlementMode,"CREDIT");assert.equal(f.row.paymentTransactionId,null);
  await assert.rejects(attachMyDataPosReceipt(f.db,identity,[page],payment,{id:"operator"}),/δεύτερη πληρωμή/);
});
test("foreign store, supplier, mismatch, deleted draft and different payment reject without writes",async()=>{
  for(const overrides of [{documentStoreId:"other"},{supplierId:"other"},{totalGross:13},{purchaseNumber:"43"},{documentDate:"2026-09-29"},{issueDate:"2026-09-29"},{documentId:null,rawPayload:{mydataDraftDocumentId:"deleted"}},{orderId:null}]){
    const f=fixture(overrides);await assert.rejects(findMyDataPurchase(f.db,identity));assert.equal(f.writes.length,0);
  }
  const f=fixture({paymentTransactionId:"another-payment"});await assert.rejects(attachMyDataPosReceipt(f.db,identity,[page],payment,{id:"operator"}),/διαφορετική πληρωμή/);assert.equal(f.writes.length,0);
});

test("real POS precheck accepts only first myDATA arrival and blocks second before payment lookup",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
  const start=source.indexOf('router.post("/ai-reader/fast-duplicate-check"');
  const end=source.indexOf('\n// Durable POS handoff',start);
  const handlerSource=source.slice(start,end).slice(source.slice(start,end).indexOf('async(req,res,next)=>'),-3).trim();
  let arrivals=false,paymentLookups=0,result,status=200,failure;
  const prisma={store:{findFirst:async()=>({id:"store"})},$queryRaw:async()=>[{id:"supplier",taxId:"099999999"}]};
  const deps={prisma,findMyDataPurchase:async()=>({...base,resultJson:arrivals?{mydataPosReceipt:{receivedAt:"2026-09-30"}}:{}}),findInvoicePayment:async()=>{paymentLookups++;return null},assertReusableInvoicePayment:()=>{},cleanTaxId:value=>value,normalizeDocumentNumber:value=>String(value),norm:value=>String(value),normalizeIntakeDate:value=>value,intakeNumber:Number,ensureV244IntakeSchema:async()=>{},ensureFastHandoffSchema:async()=>{},crypto:{}};
  const handler=new Function(...Object.keys(deps),`return ${handlerSource}`)(...Object.values(deps));
  const req={body:{...identity,dataUrl:""},user:{companyId:"company",role:"OWNER"}},res={json:value=>{result=value;return res},status:value=>{status=value;return res}};
  await handler(req,res,error=>{failure=error});assert.ifError(failure);assert.equal(status,200);assert.equal(result.canonicalDocumentNumber,"A 42");assert.equal(paymentLookups,1);
  arrivals=true;await handler(req,res,error=>{failure=error});assert.ifError(failure);assert.equal(status,409);assert.equal(result.code,"DUPLICATE_INVOICE");assert.equal(paymentLookups,1);
});
