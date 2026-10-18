import test from 'node:test';
import assert from 'node:assert/strict';
import {productSalesEvidence} from '../src/services/owner-sales-tools.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {buildAssistantReportFile} from '../src/services/assistant-report-files.js';

const args={product:'COUNT-SKU',from:'2026-10-10',to:'2026-10-10'};
const scope={companyId:'count-company',storeId:'count-store',storeName:'Count fixture'};
const item={productId:'count-product',name:'Count product',sku:args.product,storeId:scope.storeId,storeName:scope.storeName,salesQuantity:-1.25,grossSales:-2.5,netSales:-2,vatValue:-.5,normalSaleCount:0,reversalCount:1,returnGrossValue:2.5};
function report(row=item,coverage=true){
 const c=salesReportCalendar(args.from,args.to);
 return {companyId:scope.companyId,storeId:scope.storeId,period:{calendarFrom:args.from,calendarTo:args.to,timeZone:c.timeZone,from:c.from.toISOString(),toExclusive:c.to.toISOString()},reversalAware:true,count:1,items:[row],...(coverage?{sourceCoverage:{complete:true,returnedGroupCount:1,totalGroupCount:1,limit:10000,totalsScope:'COMPLETE_SOURCE'}}:{})};
}
const project=r=>productSalesEvidence(r,args,scope);
const model={status:'completed',output_text:JSON.stringify({answer:'MODEL_COUNT_TRAP 987654 euros',highlights:['987654'],limitations:''})};

test('invalid distinct transaction counts suppress matching, model amounts and actual CSV for complete and legacy sources',async()=>{
 for(const key of ['normalSaleCount','reversalCount'])for(const bad of [-1,.5,Number.MAX_SAFE_INTEGER+1])for(const coverage of [true,false]){
  const input=report({...item,[key]:bad},coverage),before=JSON.stringify(input),evidence=project(input);
  assert.equal(evidence.sourceCoverageStatus,'INVALID');assert.equal(evidence.result,'source_limited');assert.equal(evidence.truncated,true);
  assert.deepEqual(evidence.rows,[]);assert.deepEqual(evidence.candidates,[]);assert.equal(Object.hasOwn(evidence,'sourceCoverage'),false);
  assert.equal(JSON.stringify(input),before);
  const answer=assistantAnswerFromResponse(model,[evidence]);assert.equal(answer.sourceOnly,true);assert.doesNotMatch(JSON.stringify(answer),/MODEL_COUNT_TRAP|987654/);
  const table=assistantReportTables([evidence])[0];assert.deepEqual(table.rows,[]);assert.match(table.notes.join(' '),/Δεν εξάγονται ποσά/);
  const file=await buildAssistantReportFile('csv',[evidence]);const csv=Buffer.from(file.base64,'base64').toString('utf8');
  assert.match(csv,/Δεν εξάγονται ποσά/);assert.doesNotMatch(csv,/Count product|COUNT-SKU|987654/);
 }
});

test('zero and safe integer counts preserve canonical signed fractional quantities and money, including legacy warnings',()=>{
 for(const count of [0,1,Number.MAX_SAFE_INTEGER])for(const coverage of [true,false]){
  const row={...item,normalSaleCount:count,reversalCount:count},evidence=project(report(row,coverage));
  assert.equal(evidence.sourceCoverageStatus,coverage?'COMPLETE':'UNKNOWN');assert.equal(evidence.result,'matched');assert.equal(evidence.truncated,false);
  assert.deepEqual(evidence.rows,[row]);if(!coverage)assert.match(evidence.coverageWarning,/δεν παρέχει/);
  assert.equal(assistantReportTables([evidence])[0].rows[0][4],-1.25);
 }
});

test('an invalid count on a nonmatching group cannot be hidden by selecting a valid matching product',()=>{
 const input=report();input.items.push({...item,productId:'other',name:'Other',sku:'OTHER',normalSaleCount:-1});input.count=2;
 input.sourceCoverage.returnedGroupCount=2;input.sourceCoverage.totalGroupCount=2;
 const evidence=project(input);assert.equal(evidence.result,'source_limited');assert.equal(evidence.sourceCoverageStatus,'INVALID');assert.deepEqual(evidence.rows,[]);
});
