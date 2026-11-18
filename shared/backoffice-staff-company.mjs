// Company authority is independent of STORE membership and profile presets.
// These keys become selectable only after the installed protocol is verified.
export const staffCompanyProtocol='MWS_BACKOFFICE_COMPANY_V1';
export const staffCompanyCapabilities=Object.freeze(['stores.read','suppliers.read','customers.read','expense-categories.read','customer-categories.read','professions.read','shipping-methods.read']);
export const staffCompanyModules=Object.freeze({'stores.read':'INVENTORY','suppliers.read':'INVENTORY','customers.read':'POS','expense-categories.read':'CASH_CONTROL','customer-categories.read':'CORE','professions.read':'CORE','shipping-methods.read':'CORE'});
export const staffCompanyPermissionSections=Object.freeze([{key:'company',label:'Εταιρικές προβολές',actions:Object.freeze([
  {key:'stores.read',label:'Προβολή καταστημάτων εταιρείας',description:'Βλέπει τον κατάλογο καταστημάτων της εταιρείας, χωρίς ρυθμίσεις ή είσοδο στη διαχείρισή τους.'},
  {key:'suppliers.read',label:'Προβολή προμηθευτών εταιρείας',description:'Βλέπει στοιχεία επικοινωνίας και ΑΦΜ προμηθευτών της εταιρείας, χωρίς πληρωμές ή αλλαγές.'},
  {key:'expense-categories.read',label:'Προβολή εταιρικών κατηγοριών εξόδων',description:'Βλέπει τις κατηγορίες εξόδων και το πλήθος χρήσεών τους στην εταιρεία, χωρίς αλλαγές ή πληρωμές.'},
  {key:'customer-categories.read',label:'Προβολή εταιρικών κατηγοριών πελατών',description:'Βλέπει τις κατηγορίες πελατών και τις καταχωρισμένες επιλογές τους, χωρίς αλλαγές.'},
  {key:'professions.read',label:'Προβολή εταιρικών επαγγελμάτων',description:'Βλέπει επαγγέλματα και το πλήθος πελατών ανά επάγγελμα στην εταιρεία, χωρίς αλλαγές.'},
  {key:'shipping-methods.read',label:'Προβολή εταιρικών τρόπων αποστολής',description:'Βλέπει τους ενεργούς τρόπους αποστολής της εταιρείας, χωρίς αλλαγές ή στοιχεία τραπεζών/POS.'},
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
  if(path==='/api/management/expense-categories')return 'expense-categories.read';
  if(path==='/api/management/customer-categories')return 'customer-categories.read';
  if(path==='/api/management/professions')return 'professions.read';
  if(path==='/api/management/business-units/shipping-methods')return 'shipping-methods.read';
  return null;
}
