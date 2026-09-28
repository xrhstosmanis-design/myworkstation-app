import test from "node:test";
import assert from "node:assert/strict";
import {tableOrderPayloadHash,tableOrderReplay} from "../src/table-order-idempotency.js";

const body={tableId:"lab-table",items:[{productId:"coffee",quantity:1,notes:"ζεστό",allergens:["ΓΑΛΑ"],modifiers:[]}]};

test("same mobile attempt replays the original result without another round",()=>{
  const hash=tableOrderPayloadHash(body),resultJson={id:"order-1",roundNumber:3,total:3};
  assert.deepEqual(tableOrderReplay({actorId:"operator-2",payloadHash:hash,resultJson},"operator-2",hash),resultJson);
});

test("changed contents or another operator cannot reuse a round key",()=>{
  const hash=tableOrderPayloadHash(body),existing={actorId:"operator-2",payloadHash:hash,resultJson:{roundNumber:3}};
  assert.notEqual(hash,tableOrderPayloadHash({...body,items:[{...body.items[0],quantity:2}]}));
  assert.throws(()=>tableOrderReplay(existing,"operator-2",tableOrderPayloadHash({...body,items:[{...body.items[0],quantity:2}]})),error=>error.status===409);
  assert.throws(()=>tableOrderReplay(existing,"operator-3",hash),error=>error.status===409);
});
