import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {reserveSharedStock} from "../src/routes/store-pos.js";
import {buildSaleFingerprint} from "../src/pos-sale-safety.js";

const storePos=fs.readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const reconciliation=fs.readFileSync(new URL("../src/routes/kat-online-ordering-modifiers.js",import.meta.url),"utf8");
const backoffice=fs.readFileSync(new URL("../../client/src/components/commerce/OnlineOrdersBackofficePanel.jsx",import.meta.url),"utf8");

function sharedStockTx(openingStock){
  let stock=openingStock,queue=Promise.resolve();
  return{
    get stock(){return stock},
    $queryRaw(strings,...values){
      const quantity=Number(values[3]);
      const operation=queue.then(()=>{const reserved=stock>=quantity;if(reserved)stock-=quantity;return[{trackStock:true,reserved}]});
      queue=operation.then(()=>undefined,()=>undefined);
      return operation;
    }
  };
}

test("two terminals consume one shared stock atomically without a negative result",async()=>{
  const tx=sharedStockTx(1),sale=terminal=>reserveSharedStock(tx,{companyId:"kat-company",storeId:"kat-store",productId:"water",quantity:1,productName:`Νερό · ${terminal}`});
  const results=await Promise.allSettled([sale("POS-1"),sale("POS-2")]);
  assert.equal(results.filter(row=>row.status==="fulfilled").length,1);
  assert.equal(results.filter(row=>row.status==="rejected"&&row.reason?.code==="SHARED_STOCK_INSUFFICIENT").length,1);
  assert.equal(tx.stock,0);
});

test("checkout binds each sale to its own terminal shift and fail-closed device route",()=>{
  assert.match(storePos,/"terminalPos"=\$\{terminalPos\} AND "status"='OPEN'/);
  assert.match(storePos,/configuredPaymentRoute\(tx,\{companyId:req\.user\.companyId,storeId:store\.id,terminalPos,channel:paymentChannel\}\)/);
  assert.match(storePos,/sessionId:open\[0\]\.id,terminalPos/);
  assert.match(storePos,/SHARED_STOCK_INSUFFICIENT/);
  assert.match(storePos,/COALESCE\(sp\."currentStock",0\)>=\$\{quantity\}/);
});

test("identical legitimate sales on POS-1 and POS-2 do not share the duplicate fingerprint",()=>{
  const base={items:[{productId:"water",quantity:1,lineTotal:1}],paymentMethod:"CASH",payments:[{method:"CASH",amount:1}],total:1};
  assert.notEqual(buildSaleFingerprint({...base,terminalPos:"POS-1"}),buildSaleFingerprint({...base,terminalPos:"POS-2"}));
  assert.equal(buildSaleFingerprint({...base,terminalPos:"pos-1"}),buildSaleFingerprint({...base,terminalPos:"POS-1"}));
});

test("BackOffice exposes cross-terminal reconciliation and mapping alerts",()=>{
  for(const issue of ["SHIFT_TERMINAL_MISMATCH","SHIFT_SESSION_MISMATCH","EFTPOS_ROLE_MISMATCH"])assert.match(reconciliation,new RegExp(issue));
  assert.match(reconciliation,/"terminalPos","status","eftposDeviceCode","fiscalDeviceCode"/);
  assert.match(backoffice,/terminalEvidence/);
  assert.match(backoffice,/ΑΓΝΩΣΤΟ TERMINAL/);
});
