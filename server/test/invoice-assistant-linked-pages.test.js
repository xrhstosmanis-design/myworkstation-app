import test from "node:test";
import assert from "node:assert/strict";
import {loadInvoiceAssistantSource} from "../src/lib/invoice-assistant-source.js";

test("reopened BackOffice draft reads the primary photo and its merged pages in order",async()=>{
  const calls=[];
  const db={$queryRaw:async(strings,...values)=>{
    const sql=strings.join("?");
    calls.push({sql,values});
    if(sql.includes('FROM "PurchaseOrder"'))return [{id:"draft",storeId:"lab"}];
    if(sql.includes('SELECT j."id",j."resultJson"'))return [{id:"primary",resultJson:{}}];
    if(sql.includes('"status"=\'MERGED_PAGE\''))return [{id:"second"},{id:"third"}];
    if(sql.includes('JOIN "DocumentAttachment"'))return [{filename:values[0]+".jpg",contentData:"photo"}];
    throw new Error("Unexpected source lookup");
  }};

  const {pages}=await loadInvoiceAssistantSource(db,"company","order");
  assert.deepEqual(pages.map(page=>page.filename),["primary.jpg","second.jpg","third.jpg"]);
  assert.deepEqual(calls[2].values,["company","lab","draft","primary"]);
  assert.match(calls[2].sql,/ORDER BY "createdAt","id" LIMIT 4/);
  assert.deepEqual(calls.slice(3).map(call=>call.values),[
    ["primary","company","lab"],["second","company","lab"],["third","company","lab"]
  ]);
});
