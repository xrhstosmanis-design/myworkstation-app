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
      const operation=queue.then(()=>{const previousStock=stock;stock-=quantity;return[{trackStock:true,reserved:true,previousStock,nextStock:stock}]});
      queue=operation.then(()=>undefined,()=>undefined);
      return operation;
    }
  };
}

test("two terminals complete physical sales atomically and report a negative-stock warning",async()=>{
  const tx=sharedStockTx(1),sale=terminal=>reserveSharedStock(tx,{companyId:"kat-company",storeId:"kat-store",productId:"water",quantity:1,productName:`Νερό · ${terminal}`});
  const results=await Promise.allSettled([sale("POS-1"),sale("POS-2")]);
  assert.equal(results.filter(row=>row.status==="fulfilled").length,2);
  assert.equal(results.filter(row=>row.status==="rejected").length,0);
  assert.equal(results.filter(row=>row.value?.warning?.code==="NEGATIVE_STOCK_RECORDED").length,1);
  assert.equal(tx.stock,-1);
});

test("tracked POS sale records one idempotent stock movement for a gift line",async()=>{
  const executions=[];
  const tx={
    async $queryRaw(){return[{trackStock:true,reserved:true,previousStock:1,nextStock:0}]},
    async $executeRaw(strings,...values){executions.push({sql:strings.join("?"),values});return 1}
  };
  await reserveSharedStock(tx,{companyId:"kat-company",storeId:"kat-store",productId:"gift-product",quantity:2,productName:"Gift product",saleId:"sale-1",saleLineId:"line-1",priceSource:"GIFT"});
  assert.equal(executions.length,1);
  assert.match(executions[0].sql,/INSERT INTO "StockMovement"/);
  assert.match(executions[0].sql,/'SALE'/);
  assert.match(executions[0].sql,/'POS_SALE'/);
  assert.match(executions[0].sql,/ON CONFLICT \("storeId","idempotencyKey"\)/);
  assert.ok(executions[0].values.includes(-2));
  assert.ok(executions[0].values.includes("sale-1"));
  assert.ok(executions[0].values.includes("POS πώληση · Δώρο · Gift product"));
  assert.ok(executions[0].values.includes("pos-sale:sale-1:line:line-1"));
});

test("untracked POS line does not create a stock movement",async()=>{
  let movements=0;
  const tx={
    async $queryRaw(){return[{trackStock:false,reserved:false,previousStock:null,nextStock:null}]},
    async $executeRaw(){movements+=1;return 1}
  };
  await reserveSharedStock(tx,{companyId:"kat-company",storeId:"kat-store",productId:"service",quantity:1,productName:"Service",saleId:"sale-2",saleLineId:"line-2"});
  assert.equal(movements,0);
});

test("checkout binds each sale to its own terminal shift and fail-closed device route",()=>{
  assert.match(storePos,/"terminalPos"=\$\{terminalPos\} AND "status"='OPEN'/);
  assert.match(storePos,/configuredPaymentRoute\(tx,\{companyId:req\.user\.companyId,storeId:store\.id,terminalPos:routedTerminalPos,channel:paymentChannel\}\)/);
  assert.match(storePos,/sessionId:open\[0\]\.id,terminalPos/);
  assert.match(storePos,/NEGATIVE_STOCK_RECORDED/);
  assert.doesNotMatch(storePos,/COALESCE\(sp\."currentStock",0\)>=\$\{quantity\}/);
  assert.match(storePos,/NOT EXISTS\(SELECT 1 FROM "PreparationRecipeLine"/);
  assert.match(storePos,/const saleLineId=crypto\.randomUUID\(\)/);
  assert.match(storePos,/saleId,saleLineId,priceSource:item\.priceSource/);
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
