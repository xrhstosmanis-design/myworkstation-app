import test from "node:test";
import assert from "node:assert/strict";
import {resolveKatOnlineRouting} from "../src/kat-terminal-routing.js";

test("online KAT order resolves to configured delayed terminal",()=>{
  assert.deepEqual(resolveKatOnlineRouting({configuredTerminalPos:"POS-2",currentTerminalPos:"pos-2"}),{terminalPos:"POS-2",delayed:true,purpose:"KAT_DELAYED_DELIVERY"});
});

test("online KAT order fails closed when delayed terminal is not configured",()=>{
  assert.throws(()=>resolveKatOnlineRouting({configuredTerminalPos:"",currentTerminalPos:"POS-2"}),error=>error.code==="KAT_DELAYED_TERMINAL_NOT_CONFIGURED"&&error.status===409);
});

test("online KAT order cannot be completed from terminal 1",()=>{
  assert.throws(()=>resolveKatOnlineRouting({configuredTerminalPos:"POS-2",currentTerminalPos:"POS-1"}),error=>error.code==="KAT_ONLINE_WRONG_TERMINAL"&&error.status===409);
});
