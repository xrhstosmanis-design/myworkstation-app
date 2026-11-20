import test from 'node:test';
import assert from 'node:assert/strict';
import {companyWholesaleRequest,companyWholesalePrefix} from '../../shared/backoffice-staff-company-wholesale.mjs';
import {companyWholesaleFilters} from '../src/services/backoffice-staff-company-wholesale.js';
import {enforceStaffCompanyRequest} from '../src/services/backoffice-staff-company.js';

test('wholesale invalid query is a typed parser error and an exact fail-closed admission denial before database access',async()=>{
 const path=companyWholesalePrefix+'/price-lists/saved-list/products',route=companyWholesaleRequest('GET',path);
 assert.equal(route.capability,'wholesale-price-lists.read');assert.deepEqual(companyWholesaleFilters({},route),{page:1,pageSize:50});
 let reads=0;const db={$queryRaw(){reads++;assert.fail('invalid query must not read authority or source data')}};
 for(const query of [{pageSize:'101'},{q:'x'},{pageSize:['50','100']}]){
  assert.throws(()=>companyWholesaleFilters(query,route),{status:400,code:'STAFF_WHOLESALE_QUERY_INVALID'});
  const req={method:'GET',originalUrl:path,query,headers:{},body:{},user:{id:'staff',companyId:'company',role:'EMPLOYEE',staffAccess:true},get:key=>key==='x-backoffice-company-id'?'company':undefined};
  await assert.rejects(enforceStaffCompanyRequest(db,req),{status:403,code:'STAFF_ACCESS_DENIED'});
 }
 assert.equal(reads,0);
});
