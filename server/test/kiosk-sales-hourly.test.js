import test from 'node:test';
import assert from 'node:assert/strict';
import {readSalesAnalysisReport,salesAnalysisFilters} from '../src/routes/kiosk-reports-sales-v4.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
const calendar=salesReportCalendar('2026-10-25','2026-10-25');
const filters={companyId:'c',storeId:'s',from:calendar.from,to:calendar.to,calendar,includeHourly:true};
const quantity=(unit='PIECE',normalQuantity=2,reversalQuantity=-.5)=>({unit,normalQuantity,reversalQuantity,netQuantity:normalQuantity+reversalQuantity});
const hour=(from='2026-10-25T00:00:00.000Z',offset=10800)=>({from,toExclusive:new Date(Date.parse(from)+3600000).toISOString(),localStart:'2026-10-25T03:00:00',utcOffsetSeconds:offset,normalSaleCount:1,reversalCount:1,quantities:[quantity()]});
const rows=(hours=[hour()],normal=1,reversal=1)=>[{productId:'p',name:'p',grossSales:2,netSales:2,vatValue:0,costValue:1,salesQuantity:1.5,normalSaleCount:normal,reversalCount:reversal,_hasGroup:true,_totalGroupCount:1,_overallNormalSaleCount:normal,_overallReversalCount:reversal,_hourlyMetadata:{storeValid:true,bucketCount:hours.length,maxUnitCount:hours.length?Math.max(...hours.map(h=>h.quantities.length)):0,hours}}];
const read=(source=rows(),extra={})=>readSalesAnalysisReport({...filters,...extra},{db:{$queryRaw:async()=>source}});
test('hourly opt-in retains repeated Athens autumn hour as two distinct UTC buckets and signed per-unit quantities',async()=>{
 const hours=[hour(),hour('2026-10-25T01:00:00.000Z',7200)];hours[0].quantities.push(quantity('KG',.75,-.25),quantity(null,-.25,0));
 const out=await read(rows(hours,2,2));
 assert.equal(out.hourlyActivity.complete,true);assert.equal(out.hourlyActivity.totalsScope,'COMPLETE_FILTERED_SOURCE');assert.equal(out.hourlyActivity.bucketBasis,'UTC_HOUR');
 assert.equal(out.hourlyActivity.timeZone,'Europe/Athens');assert.equal(out.hourlyActivity.from,calendar.from.toISOString());assert.equal(out.hourlyActivity.toExclusive,calendar.to.toISOString());assert.equal(out.hourlyActivity.hours.length,2);
 assert.deepEqual(out.hourlyActivity.hours[0].quantities,[quantity(),quantity('KG',.75,-.25),quantity(null,-.25,0)]);
 assert.ok(out.items.every(r=>Object.keys(r).every(k=>!k.startsWith('_'))));assert.equal(out.totalGross,2);
});
test('hourly sparse empty source is valid only with zero exact overall counts and active selected store',async()=>{
 const source=rows([],0,0);Object.assign(source[0],{_hasGroup:null,_totalGroupCount:0,productId:undefined});
 const out=await read(source);assert.deepEqual(out.items,[]);assert.deepEqual(out.hourlyActivity.hours,[]);assert.equal(out.hourlyActivity.normalSaleCount,0);
});
test('default report retains old shape and does not require hourly metadata',async()=>{
 const source=rows();delete source[0]._hourlyMetadata;const out=await read(source,{includeHourly:false});assert.equal(Object.hasOwn(out,'hourlyActivity'),false);assert.equal(out.totalGross,2);assert.equal(out.items[0].salesQuantity,1.5);
});
test('exactly one result row carries hourly metadata despite tied product ordering, with no private item fields',async()=>{
 const source=rows();source[0]._totalGroupCount=2;source.push({...source[0],productId:'q',_hourlyMetadata:null});const out=await read(source);assert.equal(out.items.length,2);assert.ok(out.items.every(r=>!Object.hasOwn(r,'_hourlyMetadata')));
 source[1]._hourlyMetadata=source[0]._hourlyMetadata;source[0]._hourlyMetadata=null;assert.equal((await read(source)).hourlyActivity.hours.length,1);
 source[0]._hourlyMetadata=source[1]._hourlyMetadata;await assert.rejects(read(source),e=>e.status===502);
});
test('hourly request requires explicit Athens calendar, selected store and exact validated bounds before any SQL',async()=>{
 let calls=0;const db={$queryRaw:async()=>{calls++;return rows()}};
 for(const extra of [{storeId:''},{storeId:null},{calendar:null},{calendar:{...calendar,timeZone:'UTC'}},{from:new Date('2026-10-25')},{to:new Date('2026-10-26')},{calendar:{...calendar,calendarFrom:'2026-02-30'}},{calendar:{...calendar,calendarFrom:'2025-01-01'}}])await assert.rejects(readSalesAnalysisReport({...filters,...extra},{db}),e=>e.status===400);
 assert.equal(calls,0);
 for(const query of [{includeHourly:'0'},{includeHourly:'true'},{includeHourly:['1']},{includeHourly:'1',storeId:'s'},{includeHourly:'1',timeZone:'Europe/Athens',from:'2026-10-25',to:'2026-10-25',storeId:''}])assert.throws(()=>salesAnalysisFilters({query,user:{companyId:'c'}}),e=>e.status===400);
 assert.equal(salesAnalysisFilters({query:{includeHourly:'1',timeZone:'Europe/Athens',from:'2026-10-25',to:'2026-10-25',storeId:'s'},user:{companyId:'c'}}).includeHourly,true);
 assert.equal(Object.hasOwn(salesAnalysisFilters({query:{storeId:'s'},user:{companyId:'c'}}),'includeHourly'),false);
});
test('hourly refuses unavailable/oversized/inconsistent source metadata instead of displaying a complete zero',async()=>{
 const changes=[m=>delete m.storeValid,m=>m.storeValid=false,m=>m.bucketCount=-1,m=>m.bucketCount=8786,m=>m.bucketCount=2,m=>m.maxUnitCount=33,m=>m.maxUnitCount=0,m=>m.hours=null,m=>m.hours=[],m=>delete m.hours];
 for(const change of changes){const source=rows();change(source[0]._hourlyMetadata);await assert.rejects(read(source),e=>e.status===(source[0]._hourlyMetadata.storeValid===false?404:502));}
 const source=rows();delete source[0]._hourlyMetadata;await assert.rejects(read(source),e=>e.status===502);
});
test('hourly validates UTC bounds, real Athens offset/local label, ordered buckets and exact distinct counts',async()=>{
 const changes=[h=>h.from='2026-10-25T00:01:00.000Z',h=>h.from='2026-10-24T20:00:00.000Z',h=>h.toExclusive='2026-10-25T02:00:00.000Z',h=>h.utcOffsetSeconds=7200,h=>h.localStart='2026-10-25T04:00:00',h=>h.normalSaleCount=-1,h=>h.normalSaleCount=.5,h=>h.reversalCount=Number.MAX_SAFE_INTEGER+1,h=>h.normalSaleCount=2,h=>{h.normalSaleCount=0;h.reversalCount=0},h=>h.quantities=[]];
 for(const change of changes){const source=rows();change(source[0]._hourlyMetadata.hours[0]);await assert.rejects(read(source),e=>e.status===502);}
 await assert.rejects(read(rows([hour(),hour()],2,2)),e=>e.status===502);
});
test('hourly rejects invalid, mixed identity, nonfinite or inconsistent unit projections',async()=>{
 const changes=[q=>q.unit={},q=>q.unit='x'.repeat(129),q=>q.normalQuantity='2',q=>q.normalQuantity=Infinity,q=>q.reversalQuantity=NaN,q=>q.netQuantity=Number.MAX_SAFE_INTEGER+1,q=>q.netQuantity=99];
 for(const change of changes){const source=rows();change(source[0]._hourlyMetadata.hours[0].quantities[0]);await assert.rejects(read(source),e=>e.status===502);}
 for(const quantities of [[quantity(),quantity()],Array.from({length:33},(_,i)=>quantity(String(i)))]){const source=rows();source[0]._hourlyMetadata.hours[0].quantities=quantities;source[0]._hourlyMetadata.maxUnitCount=quantities.length;await assert.rejects(read(source),e=>e.status===502);}
});
test('hourly SQL gates work by opt-in, aggregates full source before product limit, and sends JSON only once',async()=>{
 let sql='';await readSalesAnalysisReport(filters,{db:{$queryRaw:async(strings)=>{sql=strings.join('?');return rows()}}});
 assert.match(sql,/FROM base WHERE \? GROUP BY bucket,"unit"/);assert.match(sql,/COUNT\(DISTINCT "saleId"\)/);assert.match(sql,/FILTER\(WHERE h\."bucketCount"<=8785 AND h\."maxUnitCount"<=32\)/);assert.match(sql,/FILTER\(WHERE "unitCount"<=32\)/);assert.match(sql,/ROW_NUMBER\(\) OVER/);assert.match(sql,/to_jsonb\(owned\)->>'active'='true'/);
 assert.ok(sql.indexOf('hourly_units AS')<sql.indexOf('LIMIT 10000'));assert.match(sql,/AT TIME ZONE 'UTC'\) AT TIME ZONE 'Europe\/Athens'/);
});
