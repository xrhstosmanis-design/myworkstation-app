import test from 'node:test';
import assert from 'node:assert/strict';
import {readAssistantSalesStores,readSalesNamesCatalog} from '../src/services/assistant-sales-stores.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {presentAssistantAnswer} from '../../client/src/components/voice/presentAssistantAnswer.js';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {issueAssistantExportTicket,readAssistantExportTicket} from '../src/services/assistant-export-ticket.js';
const args={mode:'names',names:['μπύρες'],from:'2026-10-12',to:'2026-10-12'},store={companyId:'c',companyName:'Company',storeId:'s',storeName:'Selected'},access={scope:'PLATFORM_SELECTED_STORE',stores:[store],excluded:[]};
const catalog=[{productId:'a',name:'ΑΛΦΑ330',masterCategoryName:'ΜΠΥΡΕΣ',subcategoryName:'ΚΟΥΤΙΑ'},{productId:'b',name:'FIX500',masterCategoryName:'ΜΠΥΡΕΣ',subcategoryName:'ΦΙΑΛΕΣ'},{productId:'w',name:'ΝΕΡΟ',categoryName:'ΝΕΡΑ'}];
const report=async f=>{assert.equal(f.companyId,'c');assert.equal(f.storeId,'s');const c=salesReportCalendar(args.from,args.to),items=f.productIds.map(id=>({productId:id,storeId:'s',name:catalog.find(p=>p.productId===id)?.name||id,unit:'PIECE',salesQuantity:2,grossSales:3,netSales:2.65,vatValue:.35,reversalCount:1,returnGrossValue:1}));return {companyId:'c',storeId:'s',period:{calendarFrom:args.from,calendarTo:args.to,timeZone:'Europe/Athens',from:c.from.toISOString(),toExclusive:c.to.toISOString()},items,count:items.length,reversalAware:true}};
const read=(a,rows=catalog)=>readAssistantSalesStores(a,access,{readCatalog:async c=>{assert.equal(c,'c');return rows},readReport:report,now:new Date('2026-10-13T03:00:00Z')});
test('unmatched category word resolves real Master primary labels for name/family/category and genitive, with strict replay',async()=>{
 for(const mode of ['names','family','category'])for(const name of ['μπύρες','μπίρες','μπύρας','μπίρας']){
  const out=await read({...args,mode,names:[name]});assert.equal(out.result,'matched');assert.equal(out.mode,'category');assert.deepEqual(out.rows.map(r=>r.productId),['a','b']);assert.equal(out.totals.grossSales,6);assert.deepEqual(out.totals.quantities,[{unit:'PIECE',quantity:4}]);
 }
 const req={user:{id:'admin',sessionId:'sess',sessionVersion:1}},secret='fixture-secret',out=await read(args);const ticket=issueAssistantExportTicket(req,[{name:'sales_by_store',args}],[out],{selection:{companyId:'c',storeId:'s'},secret});const saved=readAssistantExportTicket(req,ticket,{secret});assert.deepEqual(saved.reads[0].args,args);assert.deepEqual((await read(saved.reads[0].args)).rows,out.rows);
});
test('real product matches/packaging ambiguity win, multiple names and numeric SKU never silently become categories',async()=>{
 const out=await read(args,[...catalog,{productId:'specific',name:'ΜΠΥΡΕΣ'}]);assert.equal(out.mode,'names');assert.deepEqual(out.rows.map(r=>r.productId),['specific']);
 const ambiguous=await read(args,[...catalog,{productId:'one',name:'ΜΠΥΡΕΣ330'},{productId:'two',name:'ΜΠΥΡΕΣ500'}]);assert.equal(ambiguous.result,'ambiguous');assert.equal(ambiguous.totals,null);
 for(const a of [{...args,names:['μπύρες','νερά']},{...args,names:['2269']}]){const result=await read(a);assert.equal(result.result,'no_match');assert.equal(result.totals,null)}
});
test('catalog category ambiguity and genuine miss show only real scoped categories, without private fields or zero totals',async()=>{
 const ambiguous=await read(args,[{productId:'a',name:'A',categoryName:'ΜΠΥΡΕΣ ΕΛΛΗΝΙΚΕΣ'},{productId:'b',name:'B',masterCategoryName:'ΜΠΙΡΕΣ ΕΙΣΑΓΩΓΗΣ'}]);assert.equal(ambiguous.result,'ambiguous');assert.equal(ambiguous.mode,'category');assert.equal(ambiguous.candidates.length,2);
 const out=await read({...args,names:['ανύπαρκτη']},catalog.map(p=>({...p,supplier:'PRIVATE',costPrice:999})));assert.equal(out.reason,'catalog_name_not_found');assert.equal(out.totals,null);assert.deepEqual(new Set(out.categoryCandidates),new Set(['ΜΠΥΡΕΣ','ΚΟΥΤΙΑ','ΦΙΑΛΕΣ','ΝΕΡΑ']));assert.doesNotMatch(JSON.stringify(out),/PRIVATE|999/);assert.match(presentAssistantAnswer({evidence:[out]}).answer,/Καταγεγραμμένες κατηγορίες/);assert.doesNotMatch(presentAssistantAnswer({evidence:[out]}).answer,/εξουσιοδοτημένο κατάστημα/);assert.match(assistantReportTables([out])[0].notes.join(' '),/ΜΠΥΡΕΣ/);
 const empty=await readAssistantSalesStores(args,{...access,stores:[]});assert.equal(empty.reason,'no_authorized_stores');assert.equal(empty.categoryCandidates,undefined);
});
test('catalog SQL reads primary Master category through the owned product and canonical company boundary',async()=>{
 await readSalesNamesCatalog('c',{db:{$queryRaw:async(s,...v)=>{const sql=s.join('?');assert.match(sql,/mp\."categoryName" AS "masterCategoryName"/);assert.match(sql,/p\."companyId"=\?/);assert.deepEqual(v,['c']);return []}}});
});
