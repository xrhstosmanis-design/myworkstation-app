import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {greeceDateInput,greeceDateTimeToIso} from "../../shared/greece-time.mjs";
const source=await readFile(new URL("../../client/src/components/commerce/installOwnerShiftControlCenter.js",import.meta.url),"utf8");
const prefix=source.slice(source.indexOf("\n")+1,source.indexOf("async function api"));
const ledger=source.slice(source.indexOf("function ledgerDetail"),source.indexOf("function categoryDetail"));
const {fmt,ledgerDetail}=new Function("greeceDateInput","greeceDateTimeToIso",prefix+"\n"+ledger+"\nreturn {fmt,ledgerDetail};")(greeceDateInput,greeceDateTimeToIso);
test("shift report uses unambiguous 24 hour Athens display with summer and winter offsets",()=>{
 assert.equal(fmt("2026-10-12T11:04:00Z"),"12/10/2026, 14:04");
 assert.equal(fmt("2026-12-12T11:04:00Z"),"12/12/2026, 13:04");
});
test("legacy payment time and actual registration remain distinct without changing timestamps",()=>{
 const row={id:"payment",type:"SUPPLIER_PAYMENT",amount:400,occurredAt:"2026-10-12T00:00:00Z",createdAt:"2026-10-12T17:22:00Z"};
 const before=JSON.stringify(row),html=ledgerDetail({transactions:[row]});
 assert.match(html,/12\/10\/2026, 03:00/);
 assert.match(html,/Καταχώριση: 12\/10\/2026, 20:22/);
 assert.match(html,/ώρα Ελλάδας/);
 assert.equal(JSON.stringify(row),before);
});
test("sales retain their event time without being relabeled as payments",()=>{
 const html=ledgerDetail({transactions:[{id:"sale",type:"SALE_CASH",amount:1.2,occurredAt:"2026-10-12T11:07:00Z"}]});
 assert.match(html,/14:07/);assert.doesNotMatch(html,/Καταχώριση:/);
});
