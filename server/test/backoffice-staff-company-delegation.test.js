import assert from 'node:assert/strict';
import test from 'node:test';
import {companyCapabilitiesAfterDelegation,companyReadDelegationOptions,validCompanyReadDelegationCeiling} from '../../shared/backoffice-staff-company-delegation.mjs';

test('authority requires both the active company grant and the Owner ceiling',()=>{
  const actor=['stores.read','categories.read','category-products.read'];
  assert.deepEqual(companyReadDelegationOptions(actor,['categories.read','vat-departments.read']),['categories.read']);
  assert.deepEqual(companyReadDelegationOptions(actor,['categories.read','product-card.rename']),[]);
  assert.deepEqual(companyReadDelegationOptions(actor,[]),[]);
  assert.equal(validCompanyReadDelegationCeiling(['stores.read','stores.read']),false);
});

test('delegation cannot add a writer or bypass a dependency',()=>{
  assert.equal(companyCapabilitiesAfterDelegation([],'product-card.rename',true),null);
  assert.equal(companyCapabilitiesAfterDelegation([],'category-products.read',true),null);
  assert.equal(companyCapabilitiesAfterDelegation(['categories.read','category-products.read'],'categories.read',false),null);
  assert.deepEqual(companyCapabilitiesAfterDelegation(['categories.read','license-status.read'],'category-products.read',true),
    ['categories.read','license-status.read','category-products.read']);
});


test('each additional directory requires both explicit selections',()=>{
  const keys=['expense-categories.read','customer-categories.read','professions.read','shipping-methods.read'];
  assert.equal(validCompanyReadDelegationCeiling(keys),true);
  assert.deepEqual(companyReadDelegationOptions(keys,keys),keys);
  for(const key of keys){
    assert.deepEqual(companyReadDelegationOptions(keys,[key]),[key]);
    assert.deepEqual(companyReadDelegationOptions(keys.filter(item=>item!==key),[key]),[]);
    assert.deepEqual(companyCapabilitiesAfterDelegation([],key,true),[key]);
  }
});
