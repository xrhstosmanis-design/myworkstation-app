import test from "node:test";
import assert from "node:assert/strict";
import {configuredKatDelayedTerminal,resolveKatOnlineRouting} from "../src/kat-terminal-routing.js";

test("online KAT order resolves to configured delayed terminal",()=>{
  assert.deepEqual(resolveKatOnlineRouting({configuredTerminalPos:"POS-2",currentTerminalPos:"pos-2"}),{terminalPos:"POS-2",delayed:true,purpose:"KAT_DELAYED_DELIVERY"});
});

test("online KAT order fails closed when delayed terminal is not configured",()=>{
  assert.throws(()=>resolveKatOnlineRouting({configuredTerminalPos:"",currentTerminalPos:"POS-2"}),error=>error.code==="KAT_DELAYED_TERMINAL_NOT_CONFIGURED"&&error.status===409);
});

test("online KAT order cannot be completed from terminal 1",()=>{
  assert.throws(()=>resolveKatOnlineRouting({configuredTerminalPos:"POS-2",currentTerminalPos:"POS-1"}),error=>error.code==="KAT_ONLINE_WRONG_TERMINAL"&&error.status===409);
});

test("delayed terminal comes from the exact active fiscal and DELIVERY EFTPOS mapping",async()=>{
  const replies=[[{fiscal:'"StoreFiscalDevice"',eftpos:'"StoreEftposDevice"'}],[{terminalPos:"lab-pos-02",hasOpenShift:true},{terminalPos:"LAB-POS-03",hasOpenShift:true}]];
  const tx={$queryRaw:async()=>replies.shift()};
  assert.equal(await configuredKatDelayedTerminal(tx,{companyId:"company",storeId:"store",currentTerminalPos:"lab-pos-02"}),"LAB-POS-02");
});

test("delayed terminal uses the unique mapped terminal with an open shift when the session alias is stale",async()=>{
  const replies=[[{fiscal:'"StoreFiscalDevice"',eftpos:'"StoreEftposDevice"'}],[{terminalPos:"LAB-POS-01",hasOpenShift:false},{terminalPos:"LAB-POS-02",hasOpenShift:true}]];
  const tx={$queryRaw:async()=>replies.shift()};
  assert.equal(await configuredKatDelayedTerminal(tx,{companyId:"company",storeId:"store",currentTerminalPos:"POS-2"}),"LAB-POS-02");
});

test("delayed terminal does not require a store-wide unique POS when the current terminal is explicitly mapped",async()=>{
  const replies=[[{fiscal:'"StoreFiscalDevice"',eftpos:'"StoreEftposDevice"'}],[{terminalPos:"POS-2"}]];
  const tx={$queryRaw:async()=>replies.shift()};
  assert.equal(await configuredKatDelayedTerminal(tx,{companyId:"company",storeId:"store",currentTerminalPos:"POS-2"}),"POS-2");
});

test("delayed terminal fails closed when more than one mapped terminal has an open shift",async()=>{
  const replies=[[{fiscal:'"StoreFiscalDevice"',eftpos:'"StoreEftposDevice"'}],[{terminalPos:"LAB-POS-01",hasOpenShift:true},{terminalPos:"LAB-POS-02",hasOpenShift:true}]];
  const tx={$queryRaw:async()=>replies.shift()};
  assert.equal(await configuredKatDelayedTerminal(tx,{companyId:"company",storeId:"store",currentTerminalPos:"POS-2"}),"");
});
