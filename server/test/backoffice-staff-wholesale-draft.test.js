import test from 'node:test';
import assert from 'node:assert/strict';
import {staffCompanyRequestCapability,validStaffCompanyCapabilities,wholesalePriceListDraftCapability as capability,wholesalePriceListDraftPath as path} from '../../shared/backoffice-staff-company.mjs';
import {createStaffWholesalePriceListDraft} from '../src/services/backoffice-staff-wholesale-draft.js';

test('wholesale draft requires its own company grant and admits only the exact POST',()=>{
  assert.equal(validStaffCompanyCapabilities([capability]),false);
  assert.equal(validStaffCompanyCapabilities(['wholesale-price-lists.read',capability]),true);
  assert.equal(staffCompanyRequestCapability('POST',path),capability);
  for(const [method,target] of [['GET',path],['PUT',path],['POST',path+'?active=true'],['POST','/api/wholesale/price-lists']]){
    assert.equal(staffCompanyRequestCapability(method,target),null);
  }
});

test('wholesale draft rejects caller-supplied active, discount or company and blocks mismatched scope before writing',async()=>{
  const db={$transaction(){assert.fail('Unexpected transaction')}};
  const req={method:'POST',originalUrl:path,user:{id:'user',staffAccess:true,companyId:'company'},
    staffCompanyGrant:{companyId:'company',capability,revision:1},
    get(name){return name==='x-backoffice-company-id'?'company':undefined}};
  for(const field of [{active:true},{discountPercent:25},{companyId:'different'}]){
    await assert.rejects(createStaffWholesalePriceListDraft(db,{...req,body:{code:'A',name:'Draft',...field}}),
      {status:400,code:'STAFF_WHOLESALE_DRAFT_INVALID'});
  }
  await assert.rejects(createStaffWholesalePriceListDraft(db,{...req,get:()=> 'different',body:{code:'A',name:'Draft'}}),{status:403});
});
