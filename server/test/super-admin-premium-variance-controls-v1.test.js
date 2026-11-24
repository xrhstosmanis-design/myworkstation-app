import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const route=await readFile(new URL("../src/routes/platform-super-admin-analytics-details.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");
test("PREMIUM controls are gated, read-only and reconcile only inside one closed shift",()=>{
  assert.match(route,/premium:level>=CHECK_PACKAGE_LEVELS\.PREMIUM_CHECK/);
  assert.match(route,/async function premiumVarianceControls/);
  assert.match(route,/scope:"PER_CLOSED_SHIFT_ONLY"/);
  assert.match(route,/t\."sessionId"=sh\."id"/);
  assert.match(route,/basketSignature/);
  assert.match(route,/POTENTIAL_PAYMENT_SWITCH_DUPLICATE/);
  assert.match(route,/premiumDuplicateWindowSeconds=40/);
  assert.match(route,/premiumDuplicateMaxTransactionDistance=2/);
  assert.match(route,/seconds>premiumDuplicateWindowSeconds/);
  assert.match(route,/distance<=premiumDuplicateMaxTransactionDistance/);
  assert.match(route,/POTENTIAL_REPEATED_REVERSAL/);
  assert.match(route,/PosOperationalEvent/);
  assert.match(route,/auditSales/);
  assert.match(route,/saleEvidenceById/);
  assert.match(route,/itemsJson/);
  assert.match(route,/readOnly:true/);
  assert.match(route,/FINAL_RECONCILED/);
  assert.match(route,/SHIFT_HANDOVER_DIFFERENCE/);
  assert.match(ui,/PREMIUM · Τελικό αποτέλεσμα ανά βάρδια/);
  assert.match(ui,/Έγκριση τελικού αποτελέσματος/);
  assert.match(ui,/Εσύ εγκρίνεις το τελικό αποτέλεσμα/);
  assert.match(ui,/\{!premium\.enabled&&<section className="platform-panel"/);
  assert.match(ui,/Βάρδιες με τελικό αποτέλεσμα/);
  assert.match(ui,/premium\.enabled&&!awaitingCount\?"Τελικό αποτέλεσμα ανά βάρδια για έγκριση"/);
  assert.match(ui,/Λειτουργικό συμβάν/);
});

test("analytics treats uncounted closing as pending while a measured zero remains reconciled", async()=>{
  const {default:express}=await import("express");
  let awaitingCount=1,missingCardCount=0;
  const calls=[];
  const measured={sessionId:"measured",cashVariance:0,cardVariance:0,closingOperational:80,
    nextOpenedAt:"2026-11-22T12:00:00Z",nextOpeningOperational:80};
  const countedWithoutCard={...measured,sessionId:"without-card",closeReconciliationStatus:"COUNTED",cardVariance:null};
  const cashFinding={...countedWithoutCard,sessionId:"cash-finding",cashVariance:7};
  const pending={...measured,sessionId:"pending",closeReconciliationStatus:"AWAITING_COUNT",
    cashVariance:null,cardVariance:null,closingOperational:null};
  const previousPrisma=globalThis.prisma;
  globalThis.prisma={
    authAudit:{create:async()=>{}},
    $queryRaw:async(strings)=>{
      const sql=strings.join("?");
      calls.push(sql);
      if(sql.includes('FROM "StorePaidModule"'))return [{moduleKey:"PREMIUM_CHECK",active:true}];
      if(sql.includes('AS "awaitingCount"'))return [{storeId:"s",companyId:"c",shifts:1+awaitingCount+missingCardCount,
        awaitingCount,missingCardCount,cashVariance:missingCardCount?7:0,cardVariance:0}];
      if(sql.includes('AS "closingOperational"')){
        if(awaitingCount)return [pending,measured];
        return missingCardCount?[countedWithoutCard,cashFinding,measured]:[measured];
      }
      if(sql.includes('AS "movementEvidence"'))return missingCardCount?[cashFinding]:[];
      if(sql.includes('WHERE s."id"='))return [{...pending,companyId:"c",storeId:"s",status:"CLOSED"}];
      return [];
    }
  };
  let router;
  try{
    ({default:router}=await import("../src/routes/platform-super-admin-analytics-details.js"));
  }finally{
    if(previousPrisma===undefined)delete globalThis.prisma;
    else globalThis.prisma=previousPrisma;
  }
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{req.user={id:"admin",isSuperAdmin:true};next()});
  app.use(router);
  const server=app.listen(0,"127.0.0.1");
  try{
    await new Promise(resolve=>server.once("listening",resolve));
    const origin=`http://127.0.0.1:${server.address().port}/super-admin-analytics`;
    const post=async(path,input={})=>fetch(origin+path,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({companyId:"c",storeId:"s",...input})});
    const mixed=await post("/execute");
    assert.equal(mixed.status,200);
    const report=await mixed.json();
    assert.equal(report.awaitingCount,1);
    assert.equal(report.rows[0].cashVariance,null);
    assert.equal(report.rows[0].cardVariance,null);
    assert.equal(report.status,"Εκκρεμεί καταμέτρηση");
    assert.deepEqual(report.findings,[]);
    const [uncounted,counted]=report.premium.shiftResults;
    assert.equal(uncounted.finalStatus,"AWAITING_COUNT");
    assert.equal(uncounted.cashVariance,null);
    assert.equal(uncounted.cardVariance,null);
    assert.equal(uncounted.closingOperational,null);
    assert.equal(uncounted.handoverDelta,null);
    assert.equal(uncounted.handoverMatched,null);
    assert.equal(uncounted.automaticOffset,false);
    assert.equal(uncounted.approvalRequired,false);
    assert.deepEqual(uncounted.evidence,[]);
    assert.equal(counted.finalStatus,"FINAL_RECONCILED");
    assert.equal(counted.cashVariance,0);
    assert.equal(counted.cardVariance,0);
    assert.equal(counted.handoverMatched,true);
    for(const decision of ["REVIEWED_NO_CHANGE","EXPLANATION","CONFIRMED_SHORTAGE"]){
      const review=await post("/sessions/pending/reviews",{decision,amount:12});
      assert.equal(review.status,409);
      assert.equal((await review.json()).code,"SHIFT_AWAITING_COUNT");
    }
    assert.ok(!calls.some(sql=>sql.includes('INSERT INTO "CashControlReview"')));
    awaitingCount=0;
    const countedReport=await (await post("/execute")).json();
    assert.equal(countedReport.awaitingCount,0);
    assert.equal(countedReport.status,"ΟΚ");
    assert.equal(countedReport.rows[0].cashVariance,0);
    assert.equal(countedReport.rows[0].cardVariance,0);
    missingCardCount=2;
    const partialReport=await (await post("/execute")).json();
    assert.equal(partialReport.rows[0].cardVariance,null);
    assert.equal(partialReport.rows[0].cashVariance,7);
    assert.equal(partialReport.findings[0].cashVariance,7);
    assert.equal(partialReport.findings[0].cardVariance,null);
    const [cashOnly,other,zero]=partialReport.premium.shiftResults;
    assert.equal(cashOnly.finalLabel,"Τελική συμφωνία μετρητών");
    assert.equal(cashOnly.cardVariance,null);
    assert.equal(cashOnly.cashVariance,0);
    assert.equal(other.finalStatus,"FINAL_UNEXPLAINED_VARIANCE");
    assert.equal(zero.finalLabel,"Τελική συμφωνία");
    assert.equal(zero.cardVariance,0);
    assert.ok(calls.some(sql=>sql.includes(`'COUNTED' AND s."cardVariance" IS NULL`)));
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
