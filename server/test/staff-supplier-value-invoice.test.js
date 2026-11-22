import test from "node:test";
import assert from "node:assert/strict";
import {createStaffSupplierValueInvoice} from "../src/services/staff-supplier-value-invoice.js";
import {staffRequestCapability} from "../../shared/backoffice-staff.mjs";

const req={user:{staffAccess:true,id:"manager",companyId:"company",storeId:"store"}};
const body={storeId:"store",documentNumber:"ΤΠ 42",documentDate:"2026-11-22",totalNet:10.25,totalVat:2.46,idempotencyKey:"15416aab-ee2e-43ce-8583-eb4ec2185140"};
function fixture({supplier=[{id:"supplier"}],duplicate=[],receipt=[]}={}){
  const calls=[];
  const tx={
    async $queryRaw(parts,...args){
      const sql=parts.join("?");
      calls.push({sql,args});
      if(sql.includes('FROM "Supplier"'))return supplier;
      if(sql.includes('LEFT JOIN "PurchaseDocument"'))return receipt;
      if(sql.includes('FROM "PurchaseDocument"'))return duplicate;
      if(sql.includes("pg_advisory_xact_lock"))return [{locked:true}];
      throw Error(sql);
    },
    async $executeRaw(parts,...args){calls.push({sql:parts.join("?"),args});return 1}
  };
  const db={$transaction:fn=>fn(tx)};
  const verify=async(writer,request,storeId,capability)=>{
    assert.equal(writer,tx);
    assert.equal(request,req);
    assert.equal(storeId,"store");
    assert.equal(capability,"invoices.value-only");
    calls.push({sql:"verified"});
  };
  return {calls,write:(input=body,check=verify)=>createStaffSupplierValueInvoice(db,req,"supplier",input,{verify:check})};
}

test("value-only entry uses a standalone grant and legacy supplier edit remains unavailable",()=>{
  assert.equal(staffRequestCapability("POST","/api/supplier-control/supplier/value-only-invoice",body),"invoices.value-only");
  assert.equal(staffRequestCapability("PATCH","/api/supplier-control/supplier",{}),null);
  assert.equal(staffRequestCapability("POST","/api/supplier-control/supplier/balance-adjustments",{}),null);
});

test("records an audited value-only draft and checks live rights inside the transaction",async()=>{
  const f=fixture();
  const result=await f.write();
  assert.equal(result.totalGross,12.71);
  assert.equal(result.reused,false);
  const save=f.calls.findIndex(x=>x.sql.includes('INSERT INTO "PurchaseDocument"'));
  assert.ok(f.calls.findIndex(x=>x.sql==="verified")<save);
  assert.match(f.calls[save].sql,/'MANUAL','DRAFT'/);
  assert.deepEqual(f.calls[save].args.slice(1,5),["company","store","supplier","ΤΠ 42"]);
  assert.ok(!f.calls.some(x=>/INSERT INTO "(StockMovement|StoreTransaction|PurchaseDocumentLine)"/.test(x.sql)));
  const audit=f.calls.find(x=>x.sql.includes('INSERT INTO "StoreOperatorAudit"'));
  assert.equal(audit.args[0],result.id);
  assert.deepEqual(audit.args.slice(1,4),["company","store","manager"]);
});

test("rejects cross-store, inactive suppliers, rejected grant, duplicates and malformed values",async()=>{
  for(const [input,error] of [[{storeId:"other"},{status:403}],[{totalNet:0.001},{name:"ZodError"}],[{documentDate:"2026-02-30"},{name:"ZodError"}],[{status:"APPROVED"},{name:"ZodError"}]]){
    const f=fixture();
    await assert.rejects(f.write({...body,...input}),error);
    assert.deepEqual(f.calls,[]);
  }
  await assert.rejects(fixture({supplier:[]}).write(),{status:404});
  await assert.rejects(fixture({duplicate:[{id:"already"}]}).write(),{code:"SUPPLIER_VALUE_INVOICE_EXISTS"});
  const revoked=fixture();
  await assert.rejects(revoked.write(body,async()=>{throw new Error("revoked")}),/revoked/);
  assert.ok(!revoked.calls.some(x=>x.sql.includes('INSERT')));
});

test("retry returns original draft, and changed or deleted drafts cannot be recreated using the same request",async()=>{
  const original=fixture(),created=await original.write();
  const {fingerprint}=JSON.parse(original.calls.find(x=>x.sql.includes('INSERT INTO "StoreOperatorAudit"')).args[4]);
  const prior={fingerprint,documentId:created.id};
  const retry=fixture({receipt:[prior]});
  assert.deepEqual(await retry.write(),{id:created.id,totalGross:12.71,reused:true});
  assert.ok(!retry.calls.some(x=>x.sql.includes('INSERT')));
  await assert.rejects(fixture({receipt:[prior]}).write({...body,totalNet:11}),{code:"VALUE_INVOICE_REQUEST_CHANGED"});
  await assert.rejects(fixture({receipt:[{...prior,documentId:null}]}).write(),{code:"VALUE_INVOICE_REQUEST_CHANGED"});
});
