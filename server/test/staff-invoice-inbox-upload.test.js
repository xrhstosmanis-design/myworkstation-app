import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {uploadInvoiceInboxOriginal} from "../src/services/invoice-inbox-upload.js";
import {staffRequestCapability,changeStaffCapability} from "../../shared/backoffice-staff.mjs";

const original=Buffer.from("%PDF-1.7\n"+"synthetic fixture\n".repeat(8));
const file={dataUrl:"data:application/pdf;base64,"+original.toString("base64"),filename:"invoice.pdf"};
const actor={id:"staff",companyId:"company",storeId:"store",fullName:"Manager",staffAccess:true};
const body={storeId:"store",file};

function fixture({duplicate=[],store={id:"store"}}={}){
  const calls=[];
  const tx={
    store:{async findFirst(query){calls.push({query});return store}},
    async $queryRaw(parts,...args){
      const sql=parts.join("?");
      calls.push({sql,args});
      if(sql.includes("pg_advisory_xact_lock"))return [{locked:true}];
      if(sql.includes('FROM "DocumentInbox"'))return duplicate;
      throw new Error(sql);
    },
    async $executeRaw(parts,...args){calls.push({sql:parts.join("?"),args});return 1}
  };
  const db={$transaction:fn=>fn(tx)};
  const authorize=async(writer,req,storeId,capability)=>{
    assert.equal(writer,tx);
    assert.equal(req.user,actor);
    assert.equal(storeId,"store");
    assert.equal(capability,"invoices.upload-original");
    calls.push({sql:"authorized"});
  };
  return {calls,send:(input=body,user=actor,verify=authorize)=>uploadInvoiceInboxOriginal(db,{user,body:input},{authorize:verify})};
}

test("requires separately granted original upload without admitting other inbox mutations",()=>{
  assert.equal(staffRequestCapability("POST","/api/commerce/documents/inbox"),"invoices.upload-original");
  assert.deepEqual(new Set(changeStaffCapability([],"invoices.upload-original",true)),new Set(["invoices.read","invoices.upload-original"]));
  assert.equal(staffRequestCapability("POST","/api/commerce/documents/inbox/one/reprocess"),null);
  assert.equal(staffRequestCapability("DELETE","/api/commerce/documents/inbox/one"),null);
});

test("stores only inbox and attachment with scoped actor after live grant and duplicate lock",async()=>{
  const f=fixture(),result=await f.send({...body,note:"synthetic"});
  assert.equal(result.status,"RECEIVED");
  assert.equal(f.calls[0].sql,"authorized");
  assert.match(f.calls[1].sql,/pg_advisory_xact_lock/);
  assert.match(f.calls[2].sql,/a\."companyId"=i\."companyId" AND a\."storeId"=i\."storeId"/);
  const checksum=createHash("sha256").update(original).digest("hex");
  assert.deepEqual(f.calls[2].args,["company","store",checksum]);
  const [attachment,inbox,audit]=f.calls.slice(3);
  assert.match(attachment.sql,/'INVOICE_INBOX'/);
  assert.deepEqual(inbox.args,[result.id,"company","store",null,attachment.args[0],"synthetic","Manager","staff"]);
  assert.match(audit.sql,/'INVOICE_ORIGINAL_UPLOADED'/);
  assert.deepEqual(audit.args.slice(1,4),["company","store","staff"]);
  assert.ok(!f.calls.some(x=>/PurchaseOrder|PurchaseDocument|StockMovement|StoreTransaction/.test(x.sql)));
});

test("rejects scope change, forged identity, mismatched format, revoked grant and already archived original",async()=>{
  const invalid=file.dataUrl.replace("application/pdf","image/png");
  for(const [input,error] of [[{storeId:"other"},{status:403}],[{supplierId:"forged"},{name:"ZodError"}],[{responsibleName:"forged"},{name:"ZodError"}],[{file:{...file,dataUrl:invalid}},{status:400}]]){
    const f=fixture();
    await assert.rejects(f.send({...body,...input}),error);
    assert.deepEqual(f.calls,[]);
  }
  const revoked=fixture();
  await assert.rejects(revoked.send(body,actor,async()=>{throw new Error("revoked")}),/revoked/);
  assert.deepEqual(revoked.calls,[]);
  const duplicate=fixture({duplicate:[{id:"existing"}]});
  await assert.rejects(duplicate.send(),{status:409});
  assert.equal(duplicate.calls.length,3);
});

test("ordinary upload uses the existing supplier metadata and still validates company/store",async()=>{
  const owner={companyId:"company",id:"owner"};
  const f=fixture();
  await f.send({...body,supplierId:"supplier",responsibleName:"Owner choice"},owner);
  assert.deepEqual(f.calls[0].query.where,{id:"store",companyId:"company"});
  const inbox=f.calls.find(x=>x.sql?.includes('INSERT INTO "DocumentInbox"'));
  assert.equal(inbox.args[3],"supplier");
  assert.equal(inbox.args[6],"Owner choice");
  await assert.rejects(fixture({store:null}).send(body,owner),{status:404});
});
