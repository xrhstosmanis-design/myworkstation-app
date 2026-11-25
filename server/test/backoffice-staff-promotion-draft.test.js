import test from 'node:test';
import assert from 'node:assert/strict';
import {promotionDraftCapability as capability,promotionDraftPath as path,staffCompanyRequestCapability,validStaffCompanyCapabilities} from '../../shared/backoffice-staff-company.mjs';
import {createStaffPromotionDraft} from '../src/services/backoffice-staff-promotion-draft.js';

test('promotion drafts require separate company authority and reject activation before writing',async()=>{
  assert.equal(staffCompanyRequestCapability('POST',path),capability);
  assert.equal(staffCompanyRequestCapability('PATCH',path),null);
  assert.equal(staffCompanyRequestCapability('POST',path+'?active=true'),null);
  assert.equal(validStaffCompanyCapabilities([capability,'product-center.read']),false);
  assert.equal(validStaffCompanyCapabilities([capability,'product-center.read','stores.read']),true);
  const body={productId:'product',storeId:'store',discountPercent:12.5,from:'2026-12-01',to:'2026-12-03'};
  const request={method:'POST',originalUrl:path,user:{companyId:'company',staffAccess:true},
    staffCompanyGrant:{companyId:'company',capability,revision:1},
    get(name){return name==='x-backoffice-company-id'?'company':undefined}};
  const db={$transaction(){assert.fail('Invalid input must not start a write')}};
  for(const change of [{active:true},{companyId:'foreign'},{to:'2026-11-30'},{discountPercent:100.01}]){
    await assert.rejects(createStaffPromotionDraft(db,{...request,body:{...body,...change}}),{status:400});
  }
  await assert.rejects(createStaffPromotionDraft(db,{...request,get:()=> 'foreign',body}),{status:403});
});
