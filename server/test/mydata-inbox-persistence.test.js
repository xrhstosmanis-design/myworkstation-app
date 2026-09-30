import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import * as xmlHelpers from "../src/mydata-xml.js";

test("real sync handler uses raw Supplier lookup and writes one draft, including unmatched suppliers",async()=>{
  const source=await readFile(new URL("../src/routes/commerce-mydata-inbox.js",import.meta.url),"utf8");
  const routes=new Map(),queries=[],writes=[];
  let matchingSupplier=true,alreadyExists=false;
  const tx={
    async $queryRaw(strings,...values){
      const sql=strings.join("?");queries.push({sql,values});
      if(sql.includes('FROM "MyDataInboundDocument"'))return alreadyExists?[{inboxId:"existing"}]:[];
      if(sql.includes('FROM "Supplier"'))return matchingSupplier?[{id:"supplier-one",name:"Supplier One"}]:[];
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    async $executeRaw(strings,...values){writes.push({sql:strings.join("?"),values});return 1}
  };
  const prisma={
    store:{async findFirst(){return {id:"store-one",company:{taxId:"088888888"}}}},
    async $executeRawUnsafe(){return 0},
    async $queryRaw(strings){
      const sql=strings.join("?");
      if(sql.includes('FROM "StoreIntegrationCredential"'))return [{enabled:true,environment:"PRODUCTION",credentialsEnc:"fixture"}];
      if(sql.includes('MAX('))return [{lastMark:"0"}];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async $transaction(callback){return callback(tx)}
  };
  const key="__mydataPersistenceTest";
  globalThis[key]={prisma,Router:()=>({post(path,...handlers){routes.set(path,handlers.at(-1))},get(){}}),...xmlHelpers};
  const injected=`import crypto from "node:crypto";
    const {prisma,Router,invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml}=globalThis.${key};
    const requireCompanyModule=()=>()=>{};
    const ensureStoreIntegrationSchema=async()=>{};
    const decryptStoreIntegrationCredentials=()=>({accountId:"fixture",secret:"fixture"});\n`;
  try{await import(`data:text/javascript;base64,${Buffer.from(injected+source.replace(/^import .*;\r?\n/gm,"")).toString("base64")}`)}finally{delete globalThis[key]}
  const handler=routes.get("/documents/mydata/sync");assert.equal(typeof handler,"function");
  const previousFetch=globalThis.fetch;
  const invoice=`<RequestedDoc><invoice><mark>12345</mark><issuer><vatNumber>099999999</vatNumber></issuer><counterpart><vatNumber>088888888</vatNumber></counterpart><invoiceHeader><aa>42</aa></invoiceHeader><invoiceSummary><totalGrossValue>12.40</totalGrossValue></invoiceSummary></invoice></RequestedDoc>`;
  globalThis.fetch=async()=>({ok:true,text:async()=>`<string>${invoice.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</string>`});
  try{
    const run=async()=>{
      let result,failure;
      await handler({body:{storeId:"store-one"},user:{companyId:"company-one",id:"owner-one",role:"OWNER"}},{json(value){result=value}},error=>{failure=error});
      assert.ifError(failure);return result;
    };
    let result=await run();assert.equal(result.created,1);assert.equal(result.documents[0].supplierName,"Supplier One");
    const lookup=queries.find(q=>q.sql.includes('FROM "Supplier"'));
    assert.deepEqual(lookup.values,["company-one","099999999"]);
    assert.match(lookup.sql,/"companyId"=\? AND "taxId"=\?/);
    assert.equal(writes.length,2);assert.equal(writes[0].values[3],"supplier-one");assert.match(writes[0].sql,/'RECEIVED'/);
    matchingSupplier=false;writes.length=0;
    result=await run();assert.equal(result.created,1);assert.equal(result.documents[0].supplierName,null);assert.equal(writes[0].values[3],null);
    alreadyExists=true;writes.length=0;queries.length=0;
    result=await run();assert.equal(result.created,0);assert.equal(result.duplicates,1);assert.equal(writes.length,0);
    assert.equal(queries.some(q=>q.sql.includes('FROM "Supplier"')),false);
    assert.equal(result.stockUpdated,false);assert.equal(result.fiscalTransmission,false);
  }finally{globalThis.fetch=previousFetch}
});
