import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {fetchStaffMyDataInboxOriginal} from "../src/mydata-original.js";
import {staffRequestCapability,changeStaffCapability} from "../../shared/backoffice-staff.mjs";

const bytes=Buffer.from("%PDF-1.7\n"+"synthetic PDF fixture\n".repeat(7));
const pdf={filename:"original.pdf",bytes,checksum:createHash("sha256").update(bytes).digest("hex")};
const scope={companyId:"company",storeId:"store",inboxId:"inbox",actorId:"manager"};
const source={id:"mydata",...scope,mark:"123",invoiceType:"1.1",status:"RECEIVED",rawPayload:{xml:"<invoice/>"}};

function fixture({initial=[source],current=initial,stored=[{id:"existing"}],deny}={}){
  const calls=[];
  const query=async(lock,parts,...args)=>{
    const sql=parts.join("?");
    calls.push({sql,args});
    if(sql.includes('FROM "MyDataInboundDocument"'))return lock?current:initial;
    if(sql.includes("pg_advisory_xact_lock"))return [{locked:true}];
    if(sql.includes('FROM "DocumentAttachment"'))return stored;
    throw Error(sql);
  };
  const tx={
    $queryRaw:(...args)=>query(true,...args),
    async $executeRaw(parts,...args){calls.push({sql:parts.join("?"),args});return 1}
  };
  const db={$queryRaw:(...args)=>query(false,...args),$transaction:fn=>fn(tx)};
  const verify=async writer=>{
    calls.push({sql:writer===tx?"verify-tx":"verify-before"});
    if(deny===writer||deny==="tx"&&writer===tx||deny==="before"&&writer===db)throw new Error("revoked");
  };
  const download=async row=>{calls.push({sql:"download"});assert.equal(row,initial[0]);return pdf};
  return {calls,run:()=>fetchStaffMyDataInboxOriginal(db,scope,verify,download)};
}

test("grant admits only the dedicated provider attachment route",()=>{
  const path="/api/commerce/documents/inbox/one/provider-original";
  assert.equal(staffRequestCapability("POST",path),"invoices.fetch-original");
  assert.equal(staffRequestCapability("GET",path),null);
  assert.equal(staffRequestCapability("POST",path.replace("provider-original","original")),null);
  assert.equal(staffRequestCapability("POST","/api/commerce/documents/mydata/sync"),null);
  assert.deepEqual(new Set(changeStaffCapability([],"invoices.fetch-original",true)),new Set(["invoices.read","invoices.fetch-original"]));
});

test("retrieves verified original with live grants, scoped row lock and attachment-only writes",async()=>{
  const f=fixture();
  assert.deepEqual(await f.run(),{id:"inbox",downloaded:true,reused:false,attachmentOnly:true});
  assert.deepEqual(f.calls.slice(0,6).map(x=>x.sql==="download"||x.sql.startsWith("verify")?x.sql:x.sql.trim().split(" ")[0]),["verify-before","SELECT","download","verify-tx","SELECT","SELECT"]);
  assert.deepEqual(f.calls[5].args,["company","store","inbox"]);
  assert.match(f.calls[5].sql,/FOR UPDATE OF m,i/);
  assert.equal(f.calls.filter(x=>x.sql.includes('INSERT INTO "DocumentAttachment"')).length,1);
  assert.equal(f.calls.filter(x=>x.sql.includes('UPDATE "DocumentInbox"')).length,1);
  assert.equal(f.calls.filter(x=>x.sql.includes("MYDATA_PROVIDER_ORIGINAL_ATTACHED")).length,1);
  assert.ok(!f.calls.some(x=>/AiReaderJob|PurchaseDocument|PurchaseOrder|StockMovement|StoreTransaction/.test(x.sql)));
});

test("denied scopes, revoked or stale requests do not write and only verified scopes fetch",async()=>{
  const initialDenied=fixture({deny:"before"}),wrong=fixture({initial:[]}),revoked=fixture({deny:"tx"});
  await assert.rejects(initialDenied.run(),/revoked/);
  await assert.rejects(wrong.run(),{status:404});
  for(const f of [initialDenied,wrong])assert.ok(!f.calls.some(x=>x.sql==="download"));
  await assert.rejects(revoked.run(),/revoked/);
  const changed=fixture({current:[{...source,mark:"changed"}]});
  await assert.rejects(changed.run(),{status:409});
  for(const f of [revoked,changed])assert.ok(!f.calls.some(x=>/INSERT|UPDATE "/.test(x.sql)));
});

test("reuses the selected store's attachment and handles concurrent downloads without a second write",async()=>{
  const attached={...source,attachmentId:"existing"};
  for(const f of [fixture({initial:[attached]}),fixture({current:[attached]})]){
    assert.deepEqual(await f.run(),{id:"inbox",downloaded:false,reused:true,attachmentOnly:true});
    assert.deepEqual(f.calls.at(-1).args,["existing","company","store"]);
    assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO')));
  }
  await assert.rejects(fixture({initial:[attached],stored:[]}).run(),{status:409});
});
