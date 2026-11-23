import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {invoiceNodes,invoiceRecipientBranch,invoiceSummary,myDataError,nextPage,unwrapMyDataXml} from "../src/mydata-xml.js";
import {myDataReceivingScope,readMyDataReceivingContinuation,saveMyDataReceivingContinuation} from "../src/services/mydata-receiving-continuation.js";
import {changeStaffCapability,staffRequestCapability} from "../../shared/backoffice-staff.mjs";

const path="/api/commerce/documents/mydata/sync";
const req={user:{id:"manager",companyId:"company",storeId:"store",staffAccess:true},staffGrant:{capability:"invoices.sync-mydata"},body:{storeId:"store"}};
const rawResponse=`<RequestedDoc><invoice><mark>123</mark><issuer><vatNumber>111111111</vatNumber></issuer><counterpart><vatNumber>222222222</vatNumber></counterpart><invoiceHeader><series>A</series><aa>1</aa><issueDate>2026-11-22</issueDate><invoiceType>1.1</invoiceType></invoiceHeader><invoiceSummary><totalNetValue>12.34</totalNetValue><totalVatAmount>2.96</totalVatAmount><totalGrossValue>15.30</totalGrossValue></invoiceSummary></invoice></RequestedDoc>`;

async function fixture({stores=[{id:"store"}],branch=null,changedWriteBranch=branch,denyWrites=false,providerBarrier,responseXml=rawResponse,failDocument=false}={}){
  const calls=[];
  const metadataJson={myDataBranchMappingRevision:"initial"};
  const setMappingRevision=revision=>{metadataJson.myDataBranchMappingRevision=revision};
  let failing=failDocument;
  const writer=(label)=>({
    label,
    store:{findMany:async query=>{assert.deepEqual(query,{where:{companyId:"company"},select:{id:true},take:2});calls.push({type:"scope",label});return stores}},
    async $queryRaw(parts,...args){
      const sql=parts.join("?");
      if(sql.includes("pg_advisory_xact_lock_shared"))return [{locked:1}];
      if(sql.includes("pg_try_advisory_xact_lock"))return [{held:true}];
      if(sql.includes('FROM "StoreIntegrationCredential"')){
        assert.deepEqual(args,["company","store"]);
        return [{enabled:true,environment:"SANDBOX",credentialsEnc:"fixture-ciphertext",metadataJson:structuredClone(metadataJson)}];
      }
      if(sql.includes('MAX(NULLIF("mark"')){assert.deepEqual(args,branch===null?["company","store","AADE_MYDATA_SANDBOX"]:["company","store","AADE_MYDATA_SANDBOX",String(branch)]);return [{lastMark:"7"}]}
      if(sql.includes('FROM "MyDataInboundDocument"')||sql.includes('FROM "Supplier"'))return [];
      throw new Error(sql);
    },
    async $executeRaw(parts,...args){
      const sql=parts.join("?");
      if(sql.includes("myDataReceivingContinuation"))metadataJson.myDataReceivingContinuation=JSON.parse(args[0]);
      if(failing&&sql.includes('INSERT INTO "MyDataInboundDocument"')){failing=false;throw new Error("inbound write failed")}
      calls.push({type:"write",sql,args});
      return 1;
    }
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
    z,crypto:{randomUUID},myDataReceivingScope,readMyDataReceivingContinuation,saveMyDataReceivingContinuation,invoiceNodes,invoiceRecipientBranch,invoiceSummary,myDataError,nextPage,unwrapMyDataXml,
    ensureMyDataBranchSchema:async()=>{},hasMyDataBranchMappings:async()=>false,readMyDataBranchForStore:async db=>db.label==="write"?changedWriteBranch:branch,
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
      return {ok:true,text:async()=>typeof responseXml==="function"?responseXml(url,setMappingRevision):responseXml};
    }
  };
  const source=await readFile(new URL("../src/routes/commerce-mydata-inbox.js",import.meta.url),"utf8");
  const stripped=source.replace(/^import .*;\r?\n/gm,"").replace(/\bexport default router;/,"").replace(/^export /gm,"");
  const api=new Function(...Object.keys(inputs),stripped+"\nreturn {syncMyDataStore,verifyDelegatedMyDataSync};")(...Object.values(inputs));
  return {api,calls,routes,metadataJson};
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


test("delegated multi-store receipt routes only the configured explicit recipient branch",async()=>{
  const invoice=rawResponse.match(/<invoice>.*<\/invoice>/)[0];
  const withBranch=(mark,branch)=>invoice.replace("<mark>123</mark>",`<mark>${mark}</mark>`)
    .replace("</counterpart>",`<branch>${branch}</branch></counterpart>`);
  const f=await fixture({stores:[{id:"store"},{id:"sibling"}],branch:0,
    responseXml:`<RequestedDoc>${withBranch(124,0)}${withBranch(125,2)}${invoice}</RequestedDoc>`});
  const result=await f.api.syncMyDataStore(req);
  assert.equal(result.created,1);
  assert.equal(result.ignoredBranch,2);
  assert.deepEqual(result.documents.map(doc=>doc.mark),["124"]);
  const writes=f.calls.filter(x=>x.type==="write");
  assert.equal(writes.length,3);
  assert.equal(JSON.parse(writes[1].args.at(-1)).recipientBranch,0);
  assert.equal(f.metadataJson.myDataReceivingContinuation.row,null);
});

test("a changed branch mapping blocks the write after the AADE response",async()=>{
  const f=await fixture({stores:[{id:"store"},{id:"sibling"}],branch:2,changedWriteBranch:3,
    responseXml:rawResponse.replace("</counterpart>","<branch>2</branch></counterpart>")});
  await assert.rejects(f.api.syncMyDataStore(req),{status:409});
  assert.equal(f.calls.filter(x=>x.type==="provider").length,1);
  assert.equal(f.calls.filter(x=>x.type==="write").length,0);
});

test("100 unmatched pages persist exact next keys and resume at the original MARK even after a failed matching page",async()=>{
  const key=index=>`page-${index}:/ +=`;
  const invoice=rawResponse.match(/<invoice>.*<\/invoice>/)[0];
  const branchInvoice=(mark,branch)=>invoice.replace("<mark>123</mark>",`<mark>${mark}</mark>`)
    .replace("</counterpart>",`<branch>${branch}</branch></counterpart>`);
  const f=await fixture({branch:0,failDocument:true,responseXml(url){
    assert.equal(url.searchParams.get("mark"),"7");
    const row=url.searchParams.get("nextRowKey");
    const index=row?Number(row.match(/page-(\d+):/)[1]):0;
    if(index===100)return `<RequestedDoc>${branchInvoice(1100,0)}</RequestedDoc>`;
    return `<RequestedDoc>${branchInvoice(index+100,2)}<nextPartitionKey>constant/ +=</nextPartitionKey><nextRowKey>${key(index+1)}</nextRowKey></RequestedDoc>`;
  }});
  const first=await f.api.syncMyDataStore(req);
  assert.deepEqual([first.continuationPending,first.fetched,first.ignoredBranch,first.created],[true,100,100,0]);
  assert.equal(f.metadataJson.myDataReceivingContinuation.row,key(100));
  assert.equal(f.metadataJson.myDataReceivingContinuation.partition,"constant/ +=");
  assert.equal(f.metadataJson.myDataReceivingContinuation.startMark,"7");
  await assert.rejects(f.api.syncMyDataStore(req),/inbound write failed/);
  assert.equal(f.metadataJson.myDataReceivingContinuation.row,key(100));
  const result=await f.api.syncMyDataStore(req);
  assert.deepEqual([result.continuationPending,result.created,result.documents[0].mark],[false,1,"1100"]);
  assert.equal(f.metadataJson.myDataReceivingContinuation.row,null);
});

test("same-branch mapping revision changes during an unmatched page reject checkpoint advancement",async()=>{
  const f=await fixture({branch:0,responseXml(_url,setRevision){
    setRevision("new-mapping");
    return "<RequestedDoc><nextPartitionKey>a</nextPartitionKey><nextRowKey>b</nextRowKey></RequestedDoc>";
  }});
  await assert.rejects(f.api.syncMyDataStore(req),{status:409});
  assert.equal(f.metadataJson.myDataReceivingContinuation,undefined);
  assert.equal(f.calls.filter(x=>x.type==="write").length,0);
});
