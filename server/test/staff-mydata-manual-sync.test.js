import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml} from "../src/mydata-xml.js";
import {changeStaffCapability,staffRequestCapability} from "../../shared/backoffice-staff.mjs";

const path="/api/commerce/documents/mydata/sync";
const req={user:{id:"manager",companyId:"company",storeId:"store",staffAccess:true},staffGrant:{capability:"invoices.sync-mydata"},body:{storeId:"store"}};
const rawResponse=`<RequestedDoc><invoice><mark>123</mark><issuer><vatNumber>111111111</vatNumber></issuer><counterpart><vatNumber>222222222</vatNumber></counterpart><invoiceHeader><series>A</series><aa>1</aa><issueDate>2026-11-22</issueDate><invoiceType>1.1</invoiceType></invoiceHeader><invoiceSummary><totalNetValue>12.34</totalNetValue><totalVatAmount>2.96</totalVatAmount><totalGrossValue>15.30</totalGrossValue></invoiceSummary></invoice></RequestedDoc>`;

async function fixture({stores=[{id:"store"}],denyWrites=false,providerBarrier,responseXml=rawResponse}={}){
  const calls=[];
  const writer=(label)=>({
    label,
    store:{findMany:async query=>{assert.deepEqual(query,{where:{companyId:"company"},select:{id:true},take:2});calls.push({type:"scope",label});return stores}},
    async $queryRaw(parts,...args){
      const sql=parts.join("?");
      if(sql.includes("pg_try_advisory_xact_lock"))return [{held:true}];
      if(sql.includes('FROM "StoreIntegrationCredential"')){
        assert.deepEqual(args,["company","store"]);
        return [{enabled:true,environment:"SANDBOX",credentialsEnc:"fixture-ciphertext"}];
      }
      if(sql.includes('MAX(NULLIF("mark"')){assert.deepEqual(args,["company","store","AADE_MYDATA_SANDBOX"]);return [{lastMark:"7"}]}
      if(sql.includes('FROM "MyDataInboundDocument"')||sql.includes('FROM "Supplier"'))return [];
      throw new Error(sql);
    },
    async $executeRaw(parts,...args){calls.push({type:"write",sql:parts.join("?"),args});return 1}
  });
  const database=writer("database");
  database.store.findFirst=async query=>{
    assert.deepEqual(query.where,{id:"store",companyId:"company"});
    return {id:"store",name:"Synthetic",company:{taxId:"222222222"}};
  };
  database.$transaction=(action,options)=>action(writer(options?.timeout===3600000?"advisory":"write"));
  database.$executeRawUnsafe=async()=>{};
  const routes={};
  const inputs={
    z,crypto:{randomUUID},invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml,
    prisma:database,Router:()=>({get(){},post(path,...handlers){routes[path]=handlers.at(-1)}}),
    requireCompanyModule:()=>()=>{},ensureStoreIntegrationSchema:async()=>{},
    decryptStoreIntegrationCredentials:encrypted=>{assert.equal(encrypted,"fixture-ciphertext");return {accountId:"fixture",secret:"fixture"}},
    assertCustomerDemoOutboundAllowed:()=>{},assertLifecycleMutation:async()=>{},
    lifecycleContext:()=>({store:"1"}),lifecycleMyDataLockKey:()=> "lock",
    async requireStaffAction(db,received,storeId,capability){
      assert.equal(received.user.id,"manager");
      assert.equal(storeId,"store");
      assert.equal(capability,"invoices.sync-mydata");
      calls.push({type:"grant",label:db.label});
      if(denyWrites&&db.label==="write")throw Object.assign(new Error("revoked"),{status:403});
    },
    fetch:async(url,options)=>{
      calls.push({type:"provider",url,options});
      if(providerBarrier)await providerBarrier;
      return {ok:true,text:async()=>responseXml};
    }
  };
  const source=await readFile(new URL("../src/routes/commerce-mydata-inbox.js",import.meta.url),"utf8");
  const stripped=source.replace(/^import .*;\r?\n/gm,"").replace(/\bexport default router;/,"").replace(/^export /gm,"");
  const api=new Function(...Object.keys(inputs),stripped+"\nreturn {syncMyDataStore,verifyDelegatedMyDataSync};")(...Object.values(inputs));
  return {api,calls,routes};
}

test("manual receipt is a distinct store grant and writes only the inbox and inbound metadata",async()=>{
  assert.equal(staffRequestCapability("POST",path),"invoices.sync-mydata");
  assert.deepEqual(new Set(changeStaffCapability([],"invoices.sync-mydata",true)),new Set(["invoices.read","invoices.sync-mydata"]));
  const f=await fixture();
  const result=await f.api.syncMyDataStore(req);
  const outbound=f.calls.find(x=>x.type==="provider");
  assert.equal(outbound.url.origin,"https://mydataapidev.aade.gr");
  assert.equal(outbound.url.searchParams.get("mark"),"7");
  assert.equal(outbound.options.redirect,"error");
  const writes=f.calls.filter(x=>x.type==="write");
  assert.equal(writes.length,2);
  assert.match(writes[0].sql,/INSERT INTO "DocumentInbox"/);
  assert.deepEqual(writes[0].args.slice(1,3),["company","store"]);
  assert.equal(writes[0].args.at(-1),"manager");
  assert.match(writes[1].sql,/INSERT INTO "MyDataInboundDocument"/);
  assert.deepEqual(f.calls.filter(x=>x.type==="grant").map(x=>x.label),["database","database","write","database"]);
  assert.deepEqual([result.created,result.originalsDownloaded,result.stockUpdated,result.fiscalTransmission],[1,0,false,false]);
});

test("shared company AFM, foreign scope or revoked grant refuse delegated receipt",async()=>{
  const multi=await fixture({stores:[{id:"store"},{id:"sibling"}]});
  await assert.rejects(multi.api.syncMyDataStore(req),{status:409});
  assert.ok(!multi.calls.some(x=>x.type==="provider"));
  const wrong=await fixture();
  await assert.rejects(wrong.api.syncMyDataStore({...req,user:{...req.user,storeId:"foreign"}}),{status:403});
  assert.ok(!wrong.calls.some(x=>x.type==="provider"));
  const revoked=await fixture({denyWrites:true});
  await assert.rejects(revoked.api.syncMyDataStore(req),/revoked/);
  assert.equal(revoked.calls.filter(x=>x.type==="provider").length,1);
  assert.ok(!revoked.calls.some(x=>x.type==="write"));
});

test("delegated caller cannot coalesce with another request's result",async()=>{
  let release;
  const f=await fixture({providerBarrier:new Promise(resolve=>{release=resolve})});
  const running=f.api.syncMyDataStore(req);
  try{
    await assert.rejects(f.api.syncMyDataStore(req),{status:409});
    await assert.rejects(f.api.syncMyDataStore({user:{id:"owner",companyId:"company"},body:{storeId:"store"}}),{status:409});
  }finally{release();await running}
  assert.equal(f.calls.filter(x=>x.type==="provider").length,1);
});
