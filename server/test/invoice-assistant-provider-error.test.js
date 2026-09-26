import test from "node:test";
import assert from "node:assert/strict";
import {invoiceAssistantProviderError} from "../src/lib/invoice-assistant-provider-error.js";

test("temporary provider limit preserves draft and supplies bounded retry guidance",async()=>{
  const response=new Response(JSON.stringify({error:{code:"rate_limit_exceeded"}}),{status:429,headers:{"retry-after":"45"}});
  const failure=await invoiceAssistantProviderError(response);
  assert.equal(failure.status,429);
  assert.match(failure.message,/45 δευτερόλεπτα/);
  assert.match(failure.message,/πρόχειρο διατηρήθηκε/);
});

test("provider quota exhaustion does not suggest immediate retry",async()=>{
  const response=new Response(JSON.stringify({error:{code:"insufficient_quota"}}),{status:429});
  const failure=await invoiceAssistantProviderError(response);
  assert.equal(failure.status,503);
  assert.match(failure.message,/χρέωσης\/του ορίου/);
});
