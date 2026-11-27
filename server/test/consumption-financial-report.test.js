import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedFinancialModes,operationalFinancialRequestCapability} from '../../shared/financial-consumption.mjs';
import {staffRequestCapability,validStaffCapabilities,staffPermissionSections} from '../../shared/backoffice-staff.mjs';
import {consumptionFinancialFilters,readStoreConsumptionFinancialReport} from '../src/services/store-consumption-financial-report.js';
import {readMonthlyConsumptionSupplement} from '../src/services/consumption-monthly-report.js';
import {validateConsumptionMonthly} from '../src/services/consumption-monthly-presentation.js';

const filters=consumptionFinancialFilters({from:'2026-11-01',to:'2026-11-30'});
const row={id:'line',source:'POS',companyId:'c',storeId:'s',createdAt:'2026-11-10T10:00:00Z',name:'Νερό',quantity:'1.25',purchasePrice:'0.996',salePrice:'2.40'};
const read=rows=>readStoreConsumptionFinancialReport({$queryRaw:async()=>rows},{companyId:'c',storeId:'s',report:'self-consumption',filters});
test('independent financial report grants map only exact GET endpoints and never imply each other',()=>{
  for(const [key,cap] of [['destructions','financial-destructions.read'],['self-consumption','financial-self-consumption.read']]){
    const path='/api/commerce/sales/financial-reports/'+key;
    assert.equal(staffRequestCapability('GET',path),cap);assert.equal(operationalFinancialRequestCapability('POST',path),null);
    assert.equal(operationalFinancialRequestCapability('GET',path+'/other'),null);
    assert.deepEqual(allowedFinancialModes([cap]),[key]);assert.equal(validStaffCapabilities([cap]),true);
    assert.ok(staffPermissionSections.some(s=>s.actions.some(a=>a.key===cap)));
  }
  assert.deepEqual(allowedFinancialModes([]),[]);
});
test('reader rounds line totals once, preserves unknown cost and genuine zero, and refuses foreign or malformed rows',async()=>{
  const result=await read([row,{...row,id:'unknown',quantity:1,purchasePrice:null,salePrice:0}]);
  assert.equal(result.rows[0].purchaseTotal,1.25);assert.equal(result.rows[0].saleTotal,3);
  assert.equal(result.totalPurchase,null);assert.equal(result.totalSale,3);assert.equal(result.missingPurchase,1);
  for(const change of [{companyId:'foreign'},{storeId:'other'},{quantity:-1},{createdAt:'2026-12-01'},{source:'PRODUCT_CARD'},{name:null}])await assert.rejects(read([{...row,...change}]),{status:503});
  await assert.rejects(read([row,row]),{status:503});
});
test('source overflow never presents a partial total as final, and empty verified source is zero',async()=>{
  const result=await read(Array.from({length:1001},(_,i)=>({...row,id:String(i)})));
  assert.equal(result.rows.length,1000);assert.equal(result.truncated,true);assert.equal(result.totalPurchase,null);assert.equal(result.totalSale,null);
  const empty=await read([]);assert.equal(empty.totalPurchase,0);assert.equal(empty.totalSale,0);
});
test('monthly supplement uses a closed Athens calendar month and immutable text, discloses missing sources, and binds scope',async()=>{
  const scope={companyId:'c',storeId:'s',fromDay:'2026-11-01',toDay:'2026-11-30',now:new Date('2026-12-01T08:00:00Z')};
  const calls=[];
  const supplement=await readMonthlyConsumptionSupplement({},scope,async(_db,args)=>{calls.push(args);return read([row])});
  assert.equal(calls.length,2);assert.equal(calls[0].filters.start.toISOString(),'2026-10-31T22:00:00.000Z');
  assert.equal(calls[0].filters.end.toISOString(),'2026-11-30T22:00:00.000Z');
  assert.match(supplement.text,/Καταστροφές/);assert.match(supplement.text,/Ιδιοκατανάλωση/);assert.match(supplement.text,/Τελικό σύνολο αγοράς/);
  assert.deepEqual(validateConsumptionMonthly(supplement,scope),supplement);
  assert.throws(()=>validateConsumptionMonthly({...supplement,text:'changed'},scope));
  assert.throws(()=>validateConsumptionMonthly(supplement,{...scope,storeId:'other'}));
  await assert.rejects(readMonthlyConsumptionSupplement({}, {...scope,now:new Date('2026-11-30T10:00Z')}));
  await assert.rejects(readMonthlyConsumptionSupplement({}, {...scope,toDay:'2026-11-29'}));
  const unavailable=await readMonthlyConsumptionSupplement({},scope,async()=>{throw Error('private error')});
  assert.match(unavailable.text,/πηγή δεν ήταν διαθέσιμη/);assert.doesNotMatch(unavailable.text,/private error|Τελικό σύνολο αγοράς: 0/);
});
