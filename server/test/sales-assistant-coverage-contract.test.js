import test from 'node:test';
import assert from 'node:assert/strict';
import {readSalesAnalysisReport,salesAnalysisFilters} from '../src/routes/kiosk-reports-sales-v4.js';
import {readCanonicalOwnerSales} from '../src/services/owner-sales-tools.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {buildAssistantReportFile} from '../src/services/assistant-report-files.js';

const scope={companyId:'contract-company',storeId:'contract-store',storeName:'Contract LAB'};
const args={product:'WATER_FIXTURE',from:'2026-10-10',to:'2026-10-10'};
const req={headers:{authorization:'Bearer isolated-contract-session'}};
const model={status:'completed',output_text:JSON.stringify({answer:'MODEL_TRAP 999 ευρώ',highlights:['999'],limitations:''})};
function sqlRows(returned,total=returned){
 const metadata={_totalGroupCount:total,_overallNormalSaleCount:total?1:0,_overallReversalCount:0};
 if(!total)return [{...metadata,_hasGroup:null}];
 return Array.from({length:returned},(_,i)=>({...metadata,_hasGroup:true,productId:`product-${i}`,storeId:scope.storeId,storeName:scope.storeName,sku:i?`package-${i}`:args.product,name:`WATER_FIXTURE package ${i}`,unit:'PIECE',salesQuantity:2,grossSales:3.5,netSales:3,vatValue:.5,normalSaleCount:1,reversalCount:0,returnGrossValue:0,costValue:2,supplierName:'PRIVATE_SUPPLIER'}));
}
// The real adapter constructs its canonical GET; the injected transport runs
// the real report reader and serializes its actual result as HTTP JSON would.
// Only SQL result rows are mocked. This is not a native SQL execution test.
async function linkedRead(rows){
 let report,fetches=0,queries=0;
 const evidence=await readCanonicalOwnerSales(req,args,scope,{fetchImpl:async(url,options)=>{
  fetches++;const endpoint=new URL(url);assert.equal(endpoint.pathname,'/api/reports/sales-analysis');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,req.headers.authorization);
  const filters=salesAnalysisFilters({user:{companyId:scope.companyId},query:Object.fromEntries(endpoint.searchParams)});
  assert.equal(filters.storeId,scope.storeId);assert.equal(filters.q,args.product);assert.equal(filters.calendar.timeZone,'Europe/Athens');
  report=await readSalesAnalysisReport(filters,{db:{$queryRaw:async(strings,...values)=>{
   queries++;assert.match(strings.join('?'),/source_counts/);assert.match(strings.join('?'),/COUNT\(DISTINCT "saleId"\)/);assert.ok(values.includes(scope.companyId));assert.ok(values.includes(scope.storeId));assert.ok(values.includes(`%${args.product}%`));return rows;
  }}});
  return {ok:true,json:async()=>JSON.parse(JSON.stringify(report))};
 }});
 assert.equal(fetches,1);assert.equal(queries,1);return {report,evidence};
}

test('actual canonical reader to product adapter certifies short and exact-cap complete sources without summing basket appearances',async()=>{
 for(const count of [2,10000]){
  const {report,evidence}=await linkedRead(sqlRows(count));
  assert.deepEqual(report.sourceCoverage,{complete:true,returnedGroupCount:count,totalGroupCount:count,limit:10000,totalsScope:'COMPLETE_SOURCE'});
  assert.equal(report.normalSaleCount,1);assert.equal(report.items.reduce((sum,row)=>sum+row.normalSaleCount,0),count);
  assert.equal(evidence.sourceCoverageStatus,'COMPLETE');assert.equal(evidence.result,'matched');assert.equal(evidence.truncated,false);assert.equal(evidence.rows.length,1);assert.equal(evidence.rows[0].grossSales,report.items[0].grossSales);
  assert.deepEqual(evidence.sourceCoverage,report.sourceCoverage);assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_SUPPLIER|costValue|_totalGroupCount|_overallNormalSaleCount/);
 }
});
test('actual overflow producer output becomes empty limited evidence and cannot supply model or exported amounts',async()=>{
 const rows=sqlRows(10000,10001);Object.assign(rows[0],{unit:'KG',salesQuantity:-.25});
 const {report,evidence}=await linkedRead(rows);
 assert.equal(report.sourceCoverage.complete,false);assert.equal(report.sourceCoverage.totalsScope,'RETURNED_GROUPS');assert.equal(report.normalSaleCount,1);assert.equal(report.totalGross,35000);
 assert.equal(evidence.sourceCoverageStatus,'PARTIAL');assert.equal(evidence.result,'source_limited');assert.deepEqual(evidence.rows,[]);
 const answer=assistantAnswerFromResponse(model,[evidence]);assert.equal(answer.sourceOnly,true);assert.doesNotMatch(JSON.stringify(answer),/MODEL_TRAP|999|35000/);
 const table=assistantReportTables([evidence])[0];assert.deepEqual(table.rows,[]);assert.match(table.notes.join(' '),/Δεν εξάγονται ποσά/);
 const file=await buildAssistantReportFile('csv',[evidence]);const csv=Buffer.from(file.base64,'base64').toString('utf8');assert.match(csv,/Δεν εξάγονται ποσά/);assert.doesNotMatch(csv,/WATER_FIXTURE|PRIVATE_SUPPLIER|35000|MODEL_TRAP|κιλά/);
});
test('canonical quantity units survive JSON, evidence, table and CSV without guessing or exposing private costs',async()=>{
 for(const [unit,label,quantity] of [['PIECE','τεμάχια',2],['KG','κιλά',-.25],['LITER','λίτρα',1.5],['PACKAGE','συσκευασίες',-2], [null,'Μη καταγεγραμμένη',.125],['UNRECOGNIZED_UNIT','Μη καταγεγραμμένη',-.5]]){
  const rows=sqlRows(1);Object.assign(rows[0],{unit,salesQuantity:quantity});
  const {report,evidence}=await linkedRead(rows);
  assert.equal(report.items[0].unit,unit);assert.equal(evidence.rows[0].unit,unit);
  assert.equal(evidence.rows[0].salesQuantity,quantity);assert.equal(evidence.sourceCoverageStatus,'COMPLETE');
  assert.equal(evidence.rows[0].grossSales,3.5);assert.equal(evidence.rows[0].netSales,3);assert.equal(evidence.rows[0].vatValue,.5);
  assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_SUPPLIER|costValue|unitCost/);
  const table=assistantReportTables([evidence])[0];assert.equal(table.columns[3],'Μονάδα');assert.equal(table.rows[0][3],label);assert.equal(table.rows[0][4],quantity);
  const file=await buildAssistantReportFile('csv',[evidence]);const csv=Buffer.from(file.base64,'base64').toString('utf8');
  assert.ok(csv.includes(label));assert.doesNotMatch(csv,/PRIVATE_SUPPLIER|costValue|unitCost|UNRECOGNIZED_UNIT/);
 }
});
test('legacy source without a unit retains its evidence shape and does not infer pieces',async()=>{
 const rows=sqlRows(1);delete rows[0].unit;
 const {evidence}=await linkedRead(rows);
 assert.equal(Object.hasOwn(evidence.rows[0],'unit'),false);
 assert.equal(assistantReportTables([evidence])[0].rows[0][3],'Μη καταγεγραμμένη');
});
test('actual empty-source SQL sentinel survives report serialization as complete empty evidence rather than an invalid or capped source',async()=>{
 const {report,evidence}=await linkedRead(sqlRows(0));
 assert.equal(report.count,0);assert.deepEqual(report.items,[]);assert.equal(report.normalSaleCount,0);assert.equal(report.reversalCount,0);
 assert.deepEqual(report.sourceCoverage,{complete:true,returnedGroupCount:0,totalGroupCount:0,limit:10000,totalsScope:'COMPLETE_SOURCE'});
 assert.equal(evidence.sourceCoverageStatus,'COMPLETE');assert.equal(evidence.result,'no_match');assert.deepEqual(evidence.rows,[]);assert.equal(evidence.truncated,false);assert.deepEqual(assistantReportTables([evidence])[0].rows,[]);
});
