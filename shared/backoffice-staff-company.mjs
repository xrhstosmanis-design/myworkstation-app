import {companyPartyControlActions,companyPartyControlRequest} from './backoffice-staff-company-party-control.mjs';
export {companyPartyControlActions,companyPartyControlRequest};
import {companyOwnerReportActions,companyOwnerReportRequest} from './backoffice-staff-company-owner-reports.mjs';
export {companyOwnerReportActions,companyOwnerReportRequest};
import {companyConfigurationActions,companyConfigurationRequest} from './backoffice-staff-company-configuration.mjs';
export {companyConfigurationActions,companyConfigurationRequest};
// Company authority is independent of STORE membership and profile presets.
// These keys become selectable only after the installed protocol is verified.
export const staffCompanyProtocol='MWS_BACKOFFICE_COMPANY_V1';
export const staffCompanyCapabilities=Object.freeze(['stores.read','suppliers.read','customers.read','expense-categories.read','customer-categories.read','professions.read','shipping-methods.read','categories.read','vat-departments.read','product-companies.read','banks.read','company-products.read','purchases.read','recipes.read','supplier-details.read','workforce-role-registry.read','reports-price-changes.read','reports-departments.read','reports-documents.read','reports-delivery.read','reports-deactivations.read','reports-logins.read','reports-sale-deletions.read','reports-pos-sale-actions.read','reports-destructions.read','reports-movements.read','reports-stocktakes.read','reports-stock-snapshot.read','reports-item-snapshot.read','reports-stock-analysis.read','reports-sales-analysis.read','reports-payroll-expenses.read','reports-supplier-invoices.read','reports-supplier-payments.read','reports-supplier-purchases.read','reports-customer-turnover.read',...companyConfigurationActions.map(action=>action.key),...companyOwnerReportActions.map(action=>action.key),...companyPartyControlActions.map(action=>action.key)]);
export const staffCompanyModules=Object.freeze({'stores.read':'INVENTORY','suppliers.read':'INVENTORY','customers.read':'POS','expense-categories.read':'CASH_CONTROL','customer-categories.read':'CORE','professions.read':'CORE','shipping-methods.read':'CORE','categories.read':'INVENTORY','vat-departments.read':'INVENTORY','product-companies.read':'INVENTORY','banks.read':'CORE','company-products.read':'INVENTORY','purchases.read':'INVENTORY','recipes.read':'INVENTORY','supplier-details.read':'INVENTORY','workforce-role-registry.read':'PERSONNEL_BASIC','reports-price-changes.read':'INVENTORY','reports-departments.read':'INVENTORY','reports-documents.read':'INVENTORY','reports-delivery.read':'INVENTORY','reports-deactivations.read':null,'reports-logins.read':'INVENTORY','reports-sale-deletions.read':null,'reports-pos-sale-actions.read':null,'reports-destructions.read':null,'reports-movements.read':'INVENTORY','reports-stocktakes.read':'INVENTORY','reports-stock-snapshot.read':'INVENTORY','reports-item-snapshot.read':'INVENTORY','reports-stock-analysis.read':'INVENTORY','reports-sales-analysis.read':'INVENTORY','reports-payroll-expenses.read':'INVENTORY','reports-supplier-invoices.read':'INVENTORY','reports-supplier-payments.read':'INVENTORY','reports-supplier-purchases.read':'INVENTORY','reports-customer-turnover.read':'CORE',...Object.fromEntries(companyConfigurationActions.map(action=>[action.key,action.module])),...Object.fromEntries(companyOwnerReportActions.map(action=>[action.key,action.module])),...Object.fromEntries(companyPartyControlActions.map(action=>[action.key,action.module]))});
export const staffCompanyPermissionSections=Object.freeze([{key:'company',label:'Εταιρικές προβολές',actions:Object.freeze([
  {key:'stores.read',label:'Προβολή καταστημάτων εταιρείας',description:'Βλέπει τον κατάλογο καταστημάτων της εταιρείας, χωρίς ρυθμίσεις ή είσοδο στη διαχείρισή τους.'},
  {key:'suppliers.read',label:'Προβολή προμηθευτών εταιρείας',description:'Βλέπει στοιχεία επικοινωνίας και ΑΦΜ προμηθευτών της εταιρείας, χωρίς πληρωμές ή αλλαγές.'},
  {key:'expense-categories.read',label:'Προβολή εταιρικών κατηγοριών εξόδων',description:'Βλέπει τις κατηγορίες εξόδων και το πλήθος χρήσεών τους στην εταιρεία, χωρίς αλλαγές ή πληρωμές.'},
  {key:'customer-categories.read',label:'Προβολή εταιρικών κατηγοριών πελατών',description:'Βλέπει τις κατηγορίες πελατών και τις καταχωρισμένες επιλογές τους, χωρίς αλλαγές.'},
  {key:'professions.read',label:'Προβολή εταιρικών επαγγελμάτων',description:'Βλέπει επαγγέλματα και το πλήθος πελατών ανά επάγγελμα στην εταιρεία, χωρίς αλλαγές.'},
  {key:'shipping-methods.read',label:'Προβολή εταιρικών τρόπων αποστολής',description:'Βλέπει τους ενεργούς τρόπους αποστολής της εταιρείας, χωρίς αλλαγές ή στοιχεία τραπεζών/POS.'},
  {key:'categories.read',label:'Προβολή εταιρικών κατηγοριών προϊόντων',description:'Βλέπει κατηγορίες, υποκατηγορίες και πλήθη προϊόντων της εταιρείας, χωρίς ταξινόμηση ή αλλαγές.'},
  {key:'vat-departments.read',label:'Προβολή εταιρικών τμημάτων ΦΠΑ',description:'Βλέπει τμήματα ΦΠΑ, καταχωρισμένους συντελεστές και απαλλαγές, χωρίς αλλαγές.'},
  {key:'product-companies.read',label:'Προβολή εταιρειών προϊόντων',description:'Βλέπει τις εταιρείες προϊόντων και τα πλήθη τους στην εταιρεία, χωρίς αντιστοιχίσεις ή αλλαγές.'},
  {key:'banks.read',label:'Προβολή εταιρικού καταλόγου τραπεζών',description:'Βλέπει τις ενεργές εγγραφές τραπεζών και τους λογιστικούς κωδικούς τους, χωρίς λογαριασμούς ή κινήσεις.'},
  {key:'company-products.read',label:'Προβολή εταιρικών προϊόντων και τιμών κόστους',description:'Βλέπει έως 500 εταιρικά προϊόντα ή αποτελέσματα αναζήτησης, με τιμές πώλησης και κόστους, χωρίς αλλαγές.'},
  {key:'purchases.read',label:'Προβολή πρόσφατων εταιρικών αγορών',description:'Βλέπει μεταδεδομένα έως 300 πρόσφατων αγορών της εταιρείας, χωρίς αρχεία ή εγκρίσεις.'},
  {key:'recipes.read',label:'Προβολή εταιρικών συνταγών και κόστους',description:'Βλέπει συνταγές και διαθέσιμο κόστος εταιρικών συστατικών, χωρίς αλλαγές ή παρασκευή.'},
  {key:'supplier-details.read',requires:['suppliers.read'],label:'Προβολή εταιρικής καρτέλας προμηθευτή',description:'Βλέπει στοιχεία προμηθευτή, έως 200 αγορές και πληρωμές και εκτιμώμενο υπόλοιπο του παραθύρου, χωρίς αλλαγές.'},
  {key:'workforce-role-registry.read',label:'Προβολή πλήρους εταιρικού καταλόγου ρόλων προσωπικού',description:'Βλέπει όλους τους ρόλους προσωπικού και τα συνολικά εταιρικά πλήθη, εφόσον υπάρχει ενεργό κατάστημα με BASIC προσωπικό.'},
  {key:'reports-price-changes.read',label:'Προβολή εταιρικής αναφοράς μεταβολών τιμών',description:'Βλέπει έως 5.000 εταιρικές μεταβολές τιμών, περιλαμβανομένων γενικών μεταβολών χωρίς κατάστημα.'},
  {key:'reports-departments.read',label:'Προβολή εταιρικής διοικητικής αναφοράς τμημάτων',description:'Βλέπει ποσότητες και αξίες ολοκληρωμένων εταιρικών πωλήσεων ανά κατηγορία και ΦΠΑ· δεν αποτελεί φορολογικό Ζ.'},
  {key:'reports-documents.read',label:'Προβολή εταιρικής αναφοράς παραστατικών',description:'Βλέπει έως 5.000 αγορές και 5.000 πωλήσεις με οικονομικά μεταδεδομένα και στοιχεία συναλλασσομένων, χωρίς αρχεία ή φορολογική διαβίβαση.'},
  {key:'reports-delivery.read',label:'Προβολή εταιρικής αναφοράς δελτίων delivery',description:'Βλέπει έως 5.000 δελτία και τις γραμμές τους με στοιχεία παραλήπτη και διαθέσιμες αξίες, χωρίς αποστολή ή διαβίβαση.'},
  {key:'reports-deactivations.read',label:'Εταιρική αναφορά απενεργοποιήσεων προϊόντων',description:'Προβολή εταιρικού ιστορικού στο επιλεγμένο χρονικό παράθυρο, χωρίς αλλαγές ή ενέργειες.'},
  {key:'reports-logins.read',label:'Εταιρική αναφορά συνδέσεων χρηστών (email/IP)',description:'Βλέπει ονόματα, email, ρόλους, συσκευές και διευθύνσεις IP των συνδέσεων της εταιρείας.'},
  {key:'reports-sale-deletions.read',label:'Εταιρική αναφορά διαγραφών καλαθιού',description:'Προβολή εταιρικού ιστορικού στο επιλεγμένο χρονικό παράθυρο, χωρίς αλλαγές ή ενέργειες.'},
  {key:'reports-pos-sale-actions.read',label:'Εταιρική αναφορά ενεργειών πωλήσεων POS',description:'Προβολή εταιρικού ιστορικού στο επιλεγμένο χρονικό παράθυρο, χωρίς αλλαγές ή ενέργειες.'},
  {key:'reports-destructions.read',label:'Εταιρική αναφορά καταστροφών POS και κόστους',description:'Προβολή εταιρικού ιστορικού στο επιλεγμένο χρονικό παράθυρο, χωρίς αλλαγές ή ενέργειες.'},
  {key:'reports-movements.read',label:'Εταιρική αναφορά κινήσεων αποθέματος και κόστους',description:'Προβολή εταιρικού ιστορικού στο επιλεγμένο χρονικό παράθυρο, χωρίς αλλαγές ή ενέργειες.'},
  {key:'reports-stocktakes.read',requires:['stores.read'],label:'Εταιρική αναφορά απογραφών και διαφορών',description:'Βλέπει αναφορά και διαθέσιμες αξίες της εταιρείας, με ρητή πρόσβαση στον κατάλογο καταστημάτων, χωρίς αλλαγές.'},
  {key:'reports-stock-snapshot.read',requires:['stores.read'],label:'Εταιρική αναφορά στιγμιοτύπου αποθήκης και κόστους',description:'Βλέπει αναφορά και διαθέσιμες αξίες της εταιρείας, με ρητή πρόσβαση στον κατάλογο καταστημάτων, χωρίς αλλαγές.'},
  {key:'reports-item-snapshot.read',requires:['stores.read'],label:'Εταιρική αναφορά στιγμιοτύπου είδους και κόστους',description:'Βλέπει αναφορά και διαθέσιμες αξίες της εταιρείας, με ρητή πρόσβαση στον κατάλογο καταστημάτων, χωρίς αλλαγές.'},
  {key:'reports-stock-analysis.read',requires:['stores.read'],label:'Εταιρική αναφορά ανάλυσης αποθήκης και κόστους',description:'Βλέπει αναφορά και διαθέσιμες αξίες της εταιρείας, με ρητή πρόσβαση στον κατάλογο καταστημάτων, χωρίς αλλαγές.'},
  {key:'reports-sales-analysis.read',requires:['stores.read'],label:'Εταιρική αναφορά ανάλυσης πωλήσεων και κέρδους',description:'Βλέπει αναφορά και διαθέσιμες αξίες της εταιρείας, με ρητή πρόσβαση στον κατάλογο καταστημάτων, χωρίς αλλαγές.'},
  {key:'reports-payroll-expenses.read',requires:['stores.read', 'reports-sales-analysis.read'],label:'Εταιρική αναφορά καταγεγραμμένων πληρωμών προσωπικού',description:'Βλέπει ονόματα υπαλλήλων, συνδεδεμένες πληρωμές και ποσά καταγεγραμμένων εξόδων. Δεν αποδεικνύει εξόφληση ή δεδουλευμένα.'},
  {key:'reports-supplier-invoices.read',requires:['suppliers.read'],label:'Εταιρική αναφορά παραστατικών προμηθευτών',description:'Βλέπει οικονομικά ποσά και στοιχεία συναλλασσομένων στο επιλεγμένο διάστημα, χωρίς αρχεία, εξαγωγή ή αλλαγές.'},
  {key:'reports-supplier-payments.read',requires:['suppliers.read'],label:'Εταιρική αναφορά πληρωμών προμηθευτών',description:'Βλέπει οικονομικά ποσά και στοιχεία συναλλασσομένων στο επιλεγμένο διάστημα, χωρίς αρχεία, εξαγωγή ή αλλαγές.'},
  {key:'reports-supplier-purchases.read',requires:['suppliers.read'],label:'Εταιρική αναφορά αγορών ανά προμηθευτή',description:'Βλέπει οικονομικά ποσά και στοιχεία συναλλασσομένων στο επιλεγμένο διάστημα, χωρίς αρχεία, εξαγωγή ή αλλαγές.'},
  {key:'reports-customer-turnover.read',requires:['customers.read'],label:'Εταιρική αναφορά τζίρου και επιστροφών πελατών',description:'Βλέπει οικονομικά ποσά και στοιχεία συναλλασσομένων στο επιλεγμένο διάστημα, χωρίς αρχεία, εξαγωγή ή αλλαγές.'},
  ...companyConfigurationActions.map(({module,...action})=>action),
  ...companyOwnerReportActions.map(({module,...action})=>action),
  ...companyPartyControlActions.map(({module,...action})=>action),
  {key:'customers.read',label:'Προβολή πελατών, υπολοίπων και πιστωτικών ορίων εταιρείας',description:'Βλέπει στοιχεία επικοινωνίας, έκπτωση, οικονομικό υπόλοιπο και πιστωτικό όριο πελατών όλης της εταιρείας, χωρίς κινήσεις ή αλλαγές.'}
])}]);
export function validStaffCompanyCapabilities(value){
  return Array.isArray(value)&&value.length<=staffCompanyCapabilities.length&&new Set(value).size===value.length&&value.every(key=>staffCompanyCapabilities.includes(key))&&staffCompanyPermissionSections.flatMap(section=>section.actions).every(action=>!value.includes(action.key)||(action.requires||[]).every(key=>value.includes(key)));
}
export function staffCompanyCapabilityDependencies(key){
 const actions=staffCompanyPermissionSections.flatMap(section=>section.actions),found=new Set(),pending=[key];
 while(pending.length){const current=pending.pop();for(const dependency of actions.find(action=>action.key===current)?.requires||[])if(!found.has(dependency)){found.add(dependency);pending.push(dependency)}}
 return [...found];
}
export function changeStaffCompanyCapability(capabilities,key,enabled){
 if(!staffCompanyCapabilities.includes(key))return [...capabilities];
 const next=new Set(capabilities);enabled?next.add(key):next.delete(key);
 const actions=staffCompanyPermissionSections.flatMap(section=>section.actions);
 let changed=true;
 while(changed){changed=false;for(const action of actions){
  if(!next.has(action.key))continue;
  for(const dependency of action.requires||[])if(!next.has(dependency)){
   enabled?next.add(dependency):next.delete(action.key);changed=true;
  }
 }}
 return [...next];
}
export function staffCompanySupplierId(path){
 const match=/^\/api\/commerce\/suppliers\/([^/]+)\/detail$/.exec(path);if(!match)return null;
 let value;try{value=decodeURIComponent(match[1])}catch{return null}
 return value&&value.length<=160&&value.trim()===value&&!/[\/\\\u0000-\u001f\u007f]/.test(value)?value:null;
}
export function staffCompanyDeliveryNoteId(path){
 const match=/^\/api\/reports\/delivery\/([^/]+)\/lines$/.exec(path);if(!match)return null;
 let value;try{value=decodeURIComponent(match[1])}catch{return null}
 return value&&value.length<=160&&value.trim()===value&&!/[\/\\\u0000-\u001f\u007f]/.test(value)?value:null;
}
export function staffCompanyReportProductId(path,family){
 if(typeof path!=='string'||/[?#]/.test(path))return null;
 const pattern=family==='stock-analysis'?/^\/api\/reports\/stock-analysis\/([^/]+)\/movements$/:family==='sales-analysis'?/^\/api\/reports\/sales-analysis\/([^/]+)$/:null;
 const match=pattern?.exec(path);if(!match)return null;let value;try{value=decodeURIComponent(match[1])}catch{return null}
 return value&&value.length<=160&&value.trim()===value&&!/[\/\\\u0000-\u001f\u007f]/.test(value)?value:null;
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
  if(path==='/api/management/categories')return 'categories.read';
  if(path==='/api/management/vat-departments')return 'vat-departments.read';
  if(path==='/api/management/product-companies')return 'product-companies.read';
  if(path==='/api/management/business-units/banks')return 'banks.read';
  if(path==='/api/commerce/products')return 'company-products.read';
  if(path==='/api/commerce/purchases')return 'purchases.read';
  if(path==='/api/commerce/recipes')return 'recipes.read';
  if(staffCompanySupplierId(path)!==null)return 'supplier-details.read';
  if(path==='/api/backoffice-staff/company/workforce-roles')return 'workforce-role-registry.read';
  if(path==='/api/reports/price-changes')return 'reports-price-changes.read';
  if(path==='/api/reports/departments')return 'reports-departments.read';
  if(path==='/api/reports/documents')return 'reports-documents.read';
  if(path==='/api/reports/delivery'||staffCompanyDeliveryNoteId(path)!==null)return 'reports-delivery.read';
  if(path==='/api/reports/deactivations')return 'reports-deactivations.read';
  if(path==='/api/reports/logins')return 'reports-logins.read';
  if(path==='/api/reports/sale-deletions')return 'reports-sale-deletions.read';
  if(path==='/api/reports/pos-sale-actions')return 'reports-pos-sale-actions.read';
  if(path==='/api/reports/destructions')return 'reports-destructions.read';
  if(path==='/api/reports/movements')return 'reports-movements.read';
  if(path==='/api/reports/stocktakes')return 'reports-stocktakes.read';
  if(path==='/api/reports/stock-snapshot')return 'reports-stock-snapshot.read';
  if(path==='/api/reports/item-snapshot')return 'reports-item-snapshot.read';
  if(path==='/api/reports/stock-analysis')return 'reports-stock-analysis.read';
  if(path==='/api/reports/sales-analysis')return 'reports-sales-analysis.read';
  if(path==='/api/reports/recorded-payroll-expenses')return 'reports-payroll-expenses.read';
  if(staffCompanyReportProductId(path,'stock-analysis')!==null)return 'reports-stock-analysis.read';
  if(staffCompanyReportProductId(path,'sales-analysis')!==null)return 'reports-sales-analysis.read';
  if(path==='/api/supplier-control/reports/invoices')return 'reports-supplier-invoices.read';
  if(path==='/api/supplier-control/reports/payments')return 'reports-supplier-payments.read';
  if(path==='/api/supplier-control/reports/purchases')return 'reports-supplier-purchases.read';
  if(path==='/api/customer-control/turnover')return 'reports-customer-turnover.read';
  return companyConfigurationRequest(method,path)?.capability??companyOwnerReportRequest(method,path)?.capability??companyPartyControlRequest(method,path)?.capability??null;
}
