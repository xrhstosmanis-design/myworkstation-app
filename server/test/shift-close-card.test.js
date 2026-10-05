import test from "node:test";
import assert from "node:assert/strict";
import {verifyShiftCloseCard} from "../src/services/shift-close-card.js";
import {workCardHash} from "../src/workforce-card-code.js";

const user={tokenType:"STORE_OPERATOR",id:"op1",employeeId:"emp1",companyId:"co1",storeId:"st1"};
const session={openedBy:"op1",companyId:"co1",storeId:"st1"};
const tx={$queryRaw:async()=>[{cardCodeHash:workCardHash("MW2ABC123")}]};
test("registered opener card accepts scanner normalization",async()=>{
  await verifyShiftCloseCard(tx,user,session,"mw2 abc123");
});
test("missing and other cards fail closed",async()=>{
  for(const card of [undefined,"","OTHER123"])await assert.rejects(verifyShiftCloseCard(tx,user,session,card),{status:403});
});
test("another operator, company or store cannot close",async()=>{
  for(const change of [{openedBy:"op2"},{companyId:"co2"},{storeId:"st2"}])await assert.rejects(verifyShiftCloseCard(tx,user,{...session,...change},"MW2ABC123"),{status:403});
});
test("revoked, missing and corrupt credentials cannot close",async()=>{
  for(const rows of [[],[{cardCodeHash:null}],[{cardCodeHash:"bad"}]])await assert.rejects(verifyShiftCloseCard({$queryRaw:async()=>rows},user,session,"MW2ABC123"),{status:403});
});
test("existing privileged BackOffice closure does not query operator credentials",async()=>{
  await verifyShiftCloseCard({$queryRaw:()=>{throw Error("unexpected")}}, {tokenType:"OWNER"},session);
});
