import {walletActivityFromRequest} from "../src/services/ai-wallet-activity.js";
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {loadInvoiceAssistantSource} from "../src/lib/invoice-assistant-source.js";
import * as review from "../src/routes/invoice-assistant-review.js";
import * as pageCount from "../src/lib/invoice-assistant-page-count.js";
import {invoiceAssistantImageViews} from "../src/lib/invoice-assistant-image-views.js";
import {invoiceAssistantProviderError} from "../src/lib/invoice-assistant-provider-error.js";
import {invoiceAssistantDiscounts} from "../src/lib/invoice-assistant-discounts.js";
import {withInvoiceWalletScope,throwIfWalletError,invoiceWalletResponsesFetch as fetch} from "../src/services/ai-wallet-invoice-metering.js";
import {verifiedSetUnit} from "../src/lib/invoice-assistant-set-units.js";

test("actual source and preview handlers use identical inbox PDF, enforce context/module/role, and send no POS image to provider",async()=>{
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>",...Array(2).fill("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>")];
 let bytes="%PDF-1.4\n";objects.forEach((s,i)=>bytes+=`${i+1} 0 obj\n${s}\nendobj\n`);bytes+="trailer\n<< /Root 1 0 R >>\n%%EOF";
 const pdf="data:application/pdf;base64,"+Buffer.from(bytes).toString("base64"),queries=[],provider=[];
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join("?");queries.push({sql,values});
  if(sql.includes('FROM "PurchaseOrder"'))return values[1]==="c"?[{id:"d",storeId:"s",documentNumber:"42",totalGross:0,supplierId:"supplier"}]:[];
  if(sql.includes('FROM "MyDataInboundDocument"'))return values[0]==="i"&&values[1]==="c"&&values[2]==="s"?[{filename:"42.pdf",mimeType:"application/pdf",contentData:pdf}]:[];
  if(sql.includes('FROM "Supplier"'))return sql.includes('"taxId" FROM')?[{taxId:"099999999"}]:[];
  if(sql.includes('FROM "PurchaseOrderLine"'))return [];
  throw Error("unexpected fallback/write: "+sql);
 }};
 const routes=[];const router={get:(path,...handlers)=>routes.push({method:"GET",handlers}),post:(path,...handlers)=>routes.push({method:"POST",handlers})};
 const modules=[];let denied="";
 const deps={walletActivityFromRequest,withInvoiceWalletScope,throwIfWalletError,fetch,Router:()=>router,z,prisma:db,loadInvoiceAssistantSource,requireCompanyModule:name=>(req,res,next)=>{modules.push(name);if(name===denied)return res.status(403).json({error:"module denied"});next()},...review,...pageCount,invoiceAssistantImageViews,invoiceAssistantProviderError,invoiceAssistantDiscounts,verifiedSetUnit};
 const source=(await readFile(new URL("../src/routes/invoice-assistant-pos.js",import.meta.url),"utf8")).replace(/^import .*;\n/gm,"").replace("export default router;","return router;");
 new Function(...Object.keys(deps),source)(...Object.values(deps));
 const call=async(method,input,overrides={})=>{let status=200,body,error;const req={method,user:{companyId:"c",role:"OWNER"},params:{orderId:"o"},query:method==="GET"?input:{},body:method==="POST"?input:{},...overrides};const res={status:n=>(status=n,res),json:x=>(body=x,res)};const handlers=routes.find(r=>r.method===method).handlers;
  const run=async i=>{if(i>=handlers.length)return;let downstream;await handlers[i](req,res,e=>{if(e)error=e;else downstream=run(i+1)});await downstream};await run(0);if(error)throw error;return {status,body};
 };
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="isolated-placeholder";
 globalThis.fetch=async(url,options)=>{assert.equal(url,"https://api.openai.com/v1/responses");provider.push(JSON.parse(options.body));return {ok:true,json:async()=>({output_text:JSON.stringify({assistantMessage:"isolated review",printedTotal:"0",printedQuantityTotal:"0",printedNetTotal:"0",printedLines:[],corrections:[],expectedPageCount:2,visiblePageNumbers:[1,2],singlePageComplete:false,exciseColumnAbsent:true,unnumberedPageEvidence:[]})})}};
 try{
  const displayed=await call("GET",{inboxId:"i",storeId:"s"});assert.equal(displayed.status,200);assert.equal(displayed.body.pages[0].dataUrl,pdf);
  const read=await call("POST",{inboxId:"i",storeId:"s",message:"Check PDF",history:[]});assert.equal(read.status,200);assert.equal(read.body.reviewOnly,true);assert.equal(provider.length,1);
  const files=provider[0].input[0].content.filter(c=>c.type==="input_file");assert.deepEqual(files,[{type:"input_file",filename:"42.pdf",file_data:pdf}]);assert.equal(provider[0].input[0].content.some(c=>c.type==="input_image"),false);assert.match(provider[0].input[0].content[0].text,/2 φυσικές σελίδες/);
  for(const method of ["GET","POST"]){const base={inboxId:"i",storeId:"s",message:"Review"};
   assert.equal((await call(method,{...base,storeId:"wrong"})).status,409);
   assert.equal((await call(method,{...base,inboxId:"other"})).status,409);
   assert.equal((await call(method,{...base,storeId:undefined})).status,400);
   assert.equal((await call(method,base,{user:{companyId:"foreign",role:"OWNER"}})).status,404);
   assert.equal((await call(method,base,{user:{companyId:"c",role:"OWNER",tokenType:"STORE_OPERATOR"},posPurchaseOrderAccess:{storeId:"s"}})).status,403);
   denied="DOCUMENTS";assert.equal((await call(method,base)).status,403);denied="INVENTORY";assert.equal((await call(method,base)).status,403);denied="";
  }
  assert.equal(provider.length,1);assert.ok(modules.includes("AI_READER")&&modules.includes("DOCUMENTS")&&modules.includes("INVENTORY"));
  assert.equal(queries.some(q=>/UPDATE|INSERT|DELETE/.test(q.sql)),false);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey}
});
