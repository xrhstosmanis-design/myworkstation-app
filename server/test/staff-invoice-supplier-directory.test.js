import test from "node:test";
import assert from "node:assert/strict";
import {createInvoiceIssuerSupplier,findInvoiceSupplier} from "../src/services/invoice-supplier-directory.js";

const issuer={sourceId:"mydata",issuerVat:"123456789",xml:"<issuer><vatNumber>123456789</vatNumber><name>Εκδότης πρωτοτύπου</name></issuer>"};
const request={user:{id:"manager",companyId:"company",storeId:"store",staffAccess:true}};
const body={storeId:"store"};
const supplier={id:"supplier",name:"Εκδότης πρωτοτύπου",taxId:"123456789",active:true};

function fixture({sources=[issuer],matches=[],inserted=[supplier],concurrent=[]}={}){
  const calls=[];
  let directories=0;
  const tx={
    async $queryRaw(parts,...parameters){
      const sql=parts.join("?");
      calls.push({sql,parameters});
      if(sql.includes('FROM "PurchaseOrder"'))return sources;
      if(sql.includes('FROM "Supplier"'))return directories++===0?matches:concurrent;
      if(sql.includes('INSERT INTO "Supplier"'))return inserted;
      if(sql.includes("pg_advisory_xact_lock"))return [{locked:true}];
      throw Error(sql);
    },
    async $executeRaw(parts,...parameters){calls.push({sql:parts.join("?"),parameters});return 1}
  };
  const db={async $transaction(fn){return fn(tx)}};
  const verify=async(writer,req,storeId,capability)=>{
    assert.equal(writer,tx);
    assert.equal(req,request);
    assert.equal(storeId,"store");
    assert.equal(capability,"invoices.supplier-create");
    calls.push({sql:"verified"});
  };
  return {db,tx,calls,create:(input=body,req=request,verifyAction=verify)=>createInvoiceIssuerSupplier(db,req,"order",input,{verify:verifyAction})};
}

test("creates only from verified store-scoped myDATA and records actor and original order in the same transaction",async()=>{
  const f=fixture();
  assert.equal((await f.create()).created,true);
  assert.equal(f.calls[0].sql,"verified");
  const source=f.calls.find(x=>x.sql.includes('FROM "PurchaseOrder"'));
  assert.deepEqual(source.parameters,["order","company","store"]);
  assert.match(source.sql,/m\."companyId"=o\."companyId" AND m\."storeId"=o\."storeId"/);
  assert.match(source.sql,/FOR UPDATE OF o,m/);
  const insertion=f.calls.find(x=>x.sql.includes('INSERT INTO "Supplier"'));
  assert.deepEqual(insertion.parameters.slice(1),["company",supplier.name,supplier.taxId]);
  const audit=f.calls.find(x=>x.sql.includes("INVOICE_ISSUER_SUPPLIER_CREATED"));
  assert.deepEqual(audit.parameters.slice(1,4),["company","store","manager"]);
  assert.deepEqual(JSON.parse(audit.parameters[4]),{orderId:"order",sourceId:"mydata",supplierId:"supplier"});
});

test("does not accept unverified browser identities, wrong stores or a revoked grant",async()=>{
  const f=fixture();
  await assert.rejects(f.create({storeId:"other"}),{status:403});
  await assert.rejects(f.create({...body,taxId:"123456789",name:"Outside"}),{name:"ZodError"});
  await assert.rejects(f.create(body,request,async()=>{throw new Error("revoked")}),/revoked/);
  assert.deepEqual(f.calls,[]);
});

test("requires exactly one original with a matching issuer name and AFM",async()=>{
  for(const sources of [[],[issuer,issuer],[{...issuer,issuerVat:"987654321"}],[{...issuer,xml:null}]]){
    const f=fixture({sources});
    await assert.rejects(f.create(),{code:"INVOICE_ISSUER_NOT_VERIFIED"});
    assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO "Supplier"')));
  }
});

test("reuses a verified supplier and handles a competing create without duplicating audit",async()=>{
  for(const f of [fixture({matches:[supplier]}),fixture({inserted:[],concurrent:[supplier]})]){
    assert.deepEqual(await f.create(),{id:supplier.id,name:supplier.name,taxId:supplier.taxId,created:false});
    assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO "StoreOperatorAudit"')));
  }
});

test("local AFM lookup returns minimal company-scoped fields and rejects ambiguous matches",async()=>{
  const f=fixture({matches:[supplier]});
  assert.deepEqual(await findInvoiceSupplier(f.tx,"company",supplier.taxId),{id:supplier.id,name:supplier.name,taxId:supplier.taxId});
  assert.deepEqual(f.calls[0].parameters,["company",false,supplier.taxId]);
  assert.match(f.calls[0].sql,/"active"=true/);
  await assert.rejects(findInvoiceSupplier(fixture({matches:[supplier,{...supplier,id:"other"}]}).tx,"company",supplier.taxId),{code:"SUPPLIER_AFM_AMBIGUOUS"});
  const inactive=fixture({matches:[{...supplier,active:false}]});
  await assert.rejects(inactive.create(),{code:"SUPPLIER_INACTIVE"});
});
