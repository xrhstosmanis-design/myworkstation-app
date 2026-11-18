// Company authority is independent of STORE membership and profile presets.
// These keys become selectable only after the installed protocol is verified.
export const staffCompanyProtocol='MWS_BACKOFFICE_COMPANY_V1';
export const staffCompanyCapabilities=Object.freeze(['stores.read','suppliers.read','customers.read']);
export const staffCompanyPermissionSections=Object.freeze([{key:'company',label:'Εταιρικές προβολές',actions:Object.freeze([
  {key:'stores.read',label:'Προβολή καταστημάτων εταιρείας',description:'Βλέπει τον κατάλογο καταστημάτων της εταιρείας, χωρίς ρυθμίσεις ή είσοδο στη διαχείρισή τους.'},
  {key:'suppliers.read',label:'Προβολή προμηθευτών εταιρείας',description:'Βλέπει στοιχεία επικοινωνίας και ΑΦΜ προμηθευτών της εταιρείας, χωρίς πληρωμές ή αλλαγές.'},
  {key:'customers.read',label:'Προβολή πελατών, υπολοίπων και πιστωτικών ορίων εταιρείας',description:'Βλέπει στοιχεία επικοινωνίας, έκπτωση, οικονομικό υπόλοιπο και πιστωτικό όριο πελατών όλης της εταιρείας, χωρίς κινήσεις ή αλλαγές.'}
])}]);
export function validStaffCompanyCapabilities(value){
  return Array.isArray(value)&&value.length<=staffCompanyCapabilities.length&&new Set(value).size===value.length&&value.every(key=>staffCompanyCapabilities.includes(key));
}
export function staffCompanyRequestCapability(method,path){
  if(method!=='GET')return null;
  if(path==='/api/owner-products/stores')return 'stores.read';
  if(path==='/api/commerce/suppliers')return 'suppliers.read';
  if(path==='/api/commerce/customers')return 'customers.read';
  return null;
}
