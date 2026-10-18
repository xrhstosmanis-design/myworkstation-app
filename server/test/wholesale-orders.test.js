import test from "node:test";
import assert from "node:assert/strict";
import {buildWholesaleQuote} from "../src/lib/wholesale-pricing.js";
import {createWholesaleOrder,normalizeWholesaleOrderInput} from "../src/lib/wholesale-orders.js";

const ctx={companyId:"company-a",actorId:"owner-a",role:"OWNER",tokenType:"BACKOFFICE_USER",channel:"BACKOFFICE"};
const quoteInput={customerId:"customer-a",storeId:"store-a",items:[{productId:"product-a",quantity:"2"}]};
const key="b1bdbb09-1234-4678-9123-123456789abc";

function memoryDb(){
  const state={companyActive:true,storeActive:true,customerActive:true,price:"3.2500",version:1,orders:[],events:[],calls:[],transactions:0,failEvent:false,failInsert:[],isolation:[],transactionOptions:[]};
  const parse=(query,values)=>Array.isArray(query)?{sql:query.join("?"),values}:{sql:query.sql||query.text,values:query.values};
  const execute=async(query,...values)=>{
    const call=parse(query,values);state.calls.push(call);const sql=call.sql,v=call.values;
    if(sql.includes("pg_advisory_xact_lock"))return [{locked:""}];
    if(sql.includes('INSERT INTO "WholesaleOrderRequest"')){
      if(state.failInsert.length)throw state.failInsert.shift();
      const [id,companyId,storeId,customerId,actorId,channel,clientOrderId,requestHash,quoteId,snapshot,notes,netTotal,vatTotal,grossTotal]=v;
      assert.ok(!state.orders.some(row=>row.companyId===companyId&&row.actorId===actorId&&row.clientOrderId===clientOrderId),"database unique key");
      const row={id,companyId,storeId,customerId,actorId,channel,clientOrderId,requestHash,quoteId,snapshot:JSON.parse(snapshot),notes,netTotal,vatTotal,grossTotal,status:"SUBMITTED",revision:1,createdAt:new Date("2026-10-18T10:00:00Z")};
      state.orders.push(row);return [structuredClone(row)];
    }
    if(sql.includes('INSERT INTO "WholesaleOrderEvent"')){
      if(state.failEvent)throw Error("Simulated event failure");
      const [id,companyId,orderId,actorId,details]=v;state.events.push({id,companyId,orderId,actorId,eventType:"ORDER_SUBMITTED",details:JSON.parse(details)});return 1;
    }
    if(sql.includes('FROM "WholesaleOrderRequest"'))return state.orders.filter(row=>row.companyId===v[0]&&row.actorId===v[1]&&row.clientOrderId===v[2]).map(row=>structuredClone(row));
    if(sql.includes('FROM "Company"'))return state.companyActive&&v[0]==="company-a"?[{id:"company-a"}]:[];
    if(sql.includes('FROM "Store"'))return state.companyActive&&state.storeActive&&v[0]==="store-a"&&v[1]==="company-a"?[{id:"store-a",name:"Test store"}]:[];
    if(sql.includes('FROM "WholesaleCustomer"'))return state.companyActive&&state.customerActive&&v[0]==="customer-a"&&v[1]==="company-a"?[{id:"customer-a",name:"Test customer"}]:[];
    if(sql.includes('FROM "WholesaleCustomerPriceList"'))return [{id:"list-a",name:"Assigned list"}];
    if(sql.includes('FROM "Product"'))return [{id:"product-a",name:"Test product",sku:"SKU-A",unit:"piece",vatRate:"24.000"}];
    if(sql.includes("JOIN LATERAL"))return [{id:"tier-a",productId:"product-a",minimumQuantity:"1.0000",unitPrice:state.price,discountPercent:null,priceBasis:"NET",version:state.version}];
    throw Error(`Unexpected wholesale query: ${sql}`);
  };
  // Serialize isolated mock transactions. Native PostgreSQL coverage separately
  // proves the real advisory-lock/RepeatableRead concurrent unique-key race.
  let tail=Promise.resolve();
  const db={$queryRaw:execute,$executeRaw:execute,async $transaction(work,options){
    state.transactions++;state.isolation.push(options?.isolationLevel);state.transactionOptions.push(options);const before=tail;let unlock;tail=new Promise(resolve=>{unlock=resolve});await before;
    const baseline=structuredClone({orders:state.orders,events:state.events});
    try{return await work(db)}catch(error){state.orders=baseline.orders;state.events=baseline.events;throw error}finally{unlock()}
  }};
  return {db,state,async body(extra={},principal=ctx){const quote=await buildWholesaleQuote(db,principal,quoteInput);return {...quoteInput,clientOrderId:key,quoteId:quote.quoteId,...extra}}};
}

test("wholesale order input is strict, normalizes decimal quantities and never accepts client identity or prices",()=>{
  const valid={...quoteInput,clientOrderId:key.toUpperCase(),quoteId:"a".repeat(64),notes:"  Instructions  "};
  const normalized=normalizeWholesaleOrderInput(valid);assert.equal(normalized.clientOrderId,key);assert.equal(normalized.items[0].quantity,"2.0000");assert.equal(normalized.notes,"Instructions");
  for(const field of ["companyId","actorId","channel","status","total","netTotal","unitPrice","requestHash","snapshot"]){assert.throws(()=>normalizeWholesaleOrderInput({...valid,[field]:"untrusted"}),field)}
  for(const patch of [{clientOrderId:"not-a-uuid"},{quoteId:"bad"},{notes:"x".repeat(2001)},{notes:null},{storeId:""},{items:[{productId:"product-a",quantity:"1",unitPrice:"0"}]},{items:[{productId:"product-a",quantity:2}]}])assert.throws(()=>normalizeWholesaleOrderInput({...valid,...patch}));
});

test("wholesale submitted order and event persist one authoritative immutable snapshot without financial posting",async()=>{
  const {db,state,body}=memoryDb(),input=await body({notes:"  Delivery instructions  "});
  const result=await createWholesaleOrder(db,ctx,input);
  assert.equal(result.status,"SUBMITTED");assert.equal(result.replayed,false);assert.equal(result.orderId,result.order.id);assert.equal(result.order.channel,"BACKOFFICE");assert.equal(result.order.actorId,ctx.actorId);
  assert.deepEqual([result.order.netTotal,result.order.vatTotal,result.order.grossTotal],["6.50","1.56","8.06"]);assert.equal(result.order.snapshot.creditChecked,false);assert.equal(result.order.snapshot.items[0].quantity,"2.0000");
  assert.equal(state.orders.length,1);assert.equal(state.orders[0].notes,"Delivery instructions");assert.equal(state.events.length,1);assert.equal(state.events[0].orderId,result.orderId);assert.equal(state.events[0].details.quoteId,input.quoteId);assert.equal(state.events[0].eventType,"ORDER_SUBMITTED");
  assert.deepEqual(state.isolation,["RepeatableRead"]);assert.deepEqual(state.transactionOptions,[{isolationLevel:"RepeatableRead",timeout:15000,maxWait:5000}]);assert.ok(state.calls.some(call=>call.sql.includes("hashtextextended")&&call.sql.includes("::text")));assert.ok(state.calls.some(call=>call.sql.includes("FOR SHARE")));
  assert.ok(state.calls.every(call=>!/(?:INSERT INTO|UPDATE|DELETE FROM)\s+"(?:Sale|SaleLine|StockMovement|StoreProduct|StoreTransaction|FinancialLedger|Invoice)"/.test(call.sql)));
});

test("identical normalized replay returns original snapshot after prices change without repricing or another event",async()=>{
  const {db,state,body}=memoryDb(),input=await body(),first=await createWholesaleOrder(db,ctx,input);
  state.price="99.0000";state.version=2;const queriesBefore=state.calls.length;
  const replay=await createWholesaleOrder(db,ctx,{...input,items:[{productId:"product-a",quantity:"2.0000"}],notes:"  "});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.order,first.order);assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
  assert.ok(!state.calls.slice(queriesBefore).some(call=>call.sql.includes("JOIN LATERAL")||call.sql.includes('FROM "Product"')));
  for(const mutation of [{notes:"Changed"},{items:[{productId:"product-a",quantity:"3"}]},{quoteId:"a".repeat(64)}])await assert.rejects(createWholesaleOrder(db,ctx,{...input,...mutation}),error=>error.code==="IDEMPOTENCY_CONFLICT"&&error.status===409);
  assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
});

test("stale quote fails before order/event insert and provides current authoritative quote",async()=>{
  const {db,state,body}=memoryDb(),input=await body();state.price="4.0000";state.version=2;
  await assert.rejects(createWholesaleOrder(db,ctx,input),error=>error.code==="PRICE_CHANGED"&&error.status===409&&error.details.quote.totals.gross==="9.92"&&error.details.quote.quoteId!==input.quoteId);
  assert.equal(state.orders.length,0);assert.equal(state.events.length,0);assert.ok(!state.calls.some(call=>call.sql.includes('INSERT INTO "WholesaleOrderRequest"')));
});

test("current company/store/customer authorization is checked again for accepted replay and foreign scope",async()=>{
  const {db,state,body}=memoryDb(),input=await body();await createWholesaleOrder(db,ctx,input);
  for(const flag of ["companyActive","storeActive","customerActive"]){state[flag]=false;await assert.rejects(createWholesaleOrder(db,ctx,input),error=>error.status===404);state[flag]=true}
  for(const patch of [{storeId:"foreign-store"},{customerId:"foreign-customer"}])await assert.rejects(createWholesaleOrder(db,ctx,{...input,...patch}),error=>error.status===404);
  await assert.rejects(createWholesaleOrder(db,{...ctx,companyId:"company-b"},input),error=>error.status===404);
  for(const principal of [{...ctx,role:"EMPLOYEE"},{...ctx,tokenType:"STORE_OPERATOR"},{...ctx,channel:"FIELD_SALES"},{...ctx,channel:"B2B"},{...ctx,actorId:""}])await assert.rejects(createWholesaleOrder(db,principal,input),error=>error.status===403);
  assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
});

test("same-key concurrent mock requests produce one order and one event with replays",async()=>{
  const {db,state,body}=memoryDb(),input=await body();const results=await Promise.all(Array.from({length:8},()=>createWholesaleOrder(db,ctx,input)));
  assert.equal(new Set(results.map(result=>result.orderId)).size,1);assert.equal(results.filter(result=>!result.replayed).length,1);assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
});

test("event failure rolls back the order and safe retry creates exactly one complete request",async()=>{
  const {db,state,body}=memoryDb(),input=await body();state.failEvent=true;
  await assert.rejects(createWholesaleOrder(db,ctx,input),/Simulated event failure/);assert.equal(state.orders.length,0);assert.equal(state.events.length,0);
  state.failEvent=false;const accepted=await createWholesaleOrder(db,ctx,input);assert.equal(accepted.replayed,false);assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
});

test("serialization and insert-key races restart the entire transaction with bounded attempts",async()=>{
  const {db,state,body}=memoryDb(),input=await body();state.failInsert.push(Object.assign(Error("serialize"),{code:"P2034"}),Object.assign(Error("unique"),{code:"P2010",meta:{code:"23505"}}));
  const result=await createWholesaleOrder(db,ctx,input);assert.equal(result.replayed,false);assert.equal(state.transactions,3);assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
  const other=memoryDb(),otherInput=await other.body();other.state.failInsert=Array.from({length:4},()=>Object.assign(Error("serialize"),{code:"P2010",meta:{code:"40001"}}));
  await assert.rejects(createWholesaleOrder(other.db,ctx,otherInput),/serialize/);assert.equal(other.state.transactions,3);assert.equal(other.state.orders.length,0);assert.equal(other.state.events.length,0);
});

test("idempotency key is scoped to authenticated actor and a future tombstone cannot resurrect an order",async()=>{
  const {db,state,body}=memoryDb(),input=await body();await createWholesaleOrder(db,ctx,input);
  const otherCtx={...ctx,actorId:"owner-b"},otherInput=await body({},otherCtx);const other=await createWholesaleOrder(db,otherCtx,otherInput);
  assert.equal(other.replayed,false);assert.equal(state.orders.length,2);assert.notEqual(state.orders[0].id,state.orders[1].id);
  state.orders[0].status="CANCELLED";await assert.rejects(createWholesaleOrder(db,ctx,input),error=>error.code==="ORDER_STATE_CONFLICT"&&error.status===409);assert.equal(state.orders.length,2);assert.equal(state.events.length,2);
});

test("a corrupt saved store/customer/channel cannot disclose an out-of-scope replay snapshot",async()=>{
  const {db,state,body}=memoryDb(),input=await body();await createWholesaleOrder(db,ctx,input);
  for(const [field,value] of [["storeId","foreign-store"],["customerId","foreign-customer"],["channel","FIELD_SALES"]]){
    const original=state.orders[0][field];state.orders[0][field]=value;
    await assert.rejects(createWholesaleOrder(db,ctx,input),error=>error.status===409&&error.code==="ORDER_SCOPE_CONFLICT"&&!error.details);
    state.orders[0][field]=original;
  }
  assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
  assert.equal((await createWholesaleOrder(db,ctx,input)).replayed,true);
});
