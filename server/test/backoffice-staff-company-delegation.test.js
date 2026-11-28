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

test('product read delegation preserves catalogue dependencies and excludes product writers',()=>{
  const keys=['product-center.read','product-barcodes.read','product-set.read','product-stock-package.read'];
  assert.deepEqual(companyReadDelegationOptions(keys,keys),keys);
  assert.deepEqual(companyReadDelegationOptions(keys,['product-barcodes.read']),['product-barcodes.read']);
  assert.equal(companyCapabilitiesAfterDelegation([],'product-barcodes.read',true),null);
  assert.deepEqual(companyCapabilitiesAfterDelegation(['product-center.read'],'product-barcodes.read',true),keys.slice(0,2));
  assert.equal(companyCapabilitiesAfterDelegation(keys,'product-center.read',false),null);
  assert.equal(validCompanyReadDelegationCeiling(['product-card.rename']),false);
});

test('company product details require the catalog and do not grant product mutations',()=>{
  const parent='product-center.read';
  const keys=['product-card.read','product-details.read','product-delivery.read','product-price-history.read'];
  assert.deepEqual(companyReadDelegationOptions([parent,...keys],keys),keys);
  assert.deepEqual(companyReadDelegationOptions(keys,keys),[]);
  for(const key of keys){
    assert.equal(companyCapabilitiesAfterDelegation([],key,true),null);
    assert.deepEqual(companyCapabilitiesAfterDelegation([parent],key,true),[parent,key]);
    assert.equal(companyCapabilitiesAfterDelegation([parent,key],parent,false),null);
  }
  assert.equal(validCompanyReadDelegationCeiling(['product-card.edit-description']),false);
});

test('company price and purchase reads keep separate grants and store dependencies',()=>{
  const parents=['stores.read','product-center.read'];
  const keys=['product-audience-discounts.read','price-catalog.read','customer-wholesale-prices.read','product-purchases.read'];
  const actor=[...parents,...keys];
  assert.deepEqual(companyReadDelegationOptions(actor,keys),keys);
  assert.deepEqual(companyReadDelegationOptions(actor,[]),[]);
  assert.deepEqual(companyReadDelegationOptions(parents,keys),[]);
  assert.equal(companyCapabilitiesAfterDelegation([],'product-audience-discounts.read',true),null);
  assert.equal(companyCapabilitiesAfterDelegation(['stores.read'],'product-purchases.read',true),null);
  assert.equal(companyCapabilitiesAfterDelegation(['product-center.read'],'product-purchases.read',true),null);
  assert.deepEqual(companyCapabilitiesAfterDelegation(parents,'product-purchases.read',true),[...parents,'product-purchases.read']);
  for(const key of keys.slice(1,3)){
    assert.deepEqual(companyCapabilitiesAfterDelegation([],key,true),[key]);
  }
});
