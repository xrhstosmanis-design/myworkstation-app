import {validStaffCompanyCapabilities} from './backoffice-staff-company.mjs';

export const delegatableCompanyReadKeys=Object.freeze([
  'stores.read','categories.read','category-products.read','vat-departments.read','product-companies.read',
  'expense-categories.read','customer-categories.read','professions.read','shipping-methods.read',
  'product-center.read','product-barcodes.read','product-set.read','product-stock-package.read',
  'product-card.read','product-details.read','product-delivery.read','product-price-history.read'
]);

export function validCompanyReadDelegationCeiling(keys){
  return Array.isArray(keys)&&new Set(keys).size===keys.length&&keys.every(key=>delegatableCompanyReadKeys.includes(key));
}

export function companyReadDelegationOptions(actorCapabilities,ownerCeiling){
  if(!validStaffCompanyCapabilities(actorCapabilities)||!validCompanyReadDelegationCeiling(ownerCeiling))return [];
  return delegatableCompanyReadKeys.filter(key=>actorCapabilities.includes(key)&&ownerCeiling.includes(key));
}

export function companyCapabilitiesAfterDelegation(targetCapabilities,key,enabled){
  if(!validStaffCompanyCapabilities(targetCapabilities)||!delegatableCompanyReadKeys.includes(key)||typeof enabled!=='boolean')return null;
  const next=enabled?[...new Set([...targetCapabilities,key])]:targetCapabilities.filter(value=>value!==key);
  return validStaffCompanyCapabilities(next)?next:null;
}
