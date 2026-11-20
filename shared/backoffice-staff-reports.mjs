// STORE authority is explicit and independent from the COMPANY report policy.
import {staffCompanyDeliveryNoteId,staffCompanyReportProductId} from './backoffice-staff-company.mjs';
export const storeReportNames=Object.freeze(['price-changes','departments','documents','delivery','deactivations','sale-deletions','pos-sale-actions','destructions','movements','stocktakes','stock-snapshot','item-snapshot','stock-analysis','sales-analysis','payroll-expenses']);
export const storeReportCapabilities=Object.freeze(storeReportNames.map(name=>`store-reports-${name}.read`));
export const freeStoreReportCapabilities=Object.freeze(['deactivations','sale-deletions','pos-sale-actions','destructions'].map(name=>`store-reports-${name}.read`));
export const storeReportLabels=Object.freeze(['Μεταβολές τιμών','Διοικητική αναφορά τμημάτων','Παραστατικά','Δελτία delivery','Απενεργοποιήσεις προϊόντων','Διαγραφές καλαθιού','Ενέργειες πωλήσεων POS','Καταστροφές POS και κόστος','Κινήσεις αποθέματος και κόστος','Απογραφές και διαφορές','Στιγμιότυπο αποθήκης και κόστος','Στιγμιότυπο είδους και κόστος','Ανάλυση αποθήκης και κόστος','Ανάλυση πωλήσεων και κέρδος','Καταγεγραμμένες πληρωμές προσωπικού']);
export function storeReportRequestCapability(method,path){
 if(method!=='GET'||typeof path!=='string'||/[?#]/.test(path))return null;
 for(const name of storeReportNames)if(path===`/api/reports/${name==='payroll-expenses'?'recorded-payroll-expenses':name}`)return `store-reports-${name}.read`;
 if(staffCompanyDeliveryNoteId(path)!==null)return 'store-reports-delivery.read';
 if(staffCompanyReportProductId(path,'stock-analysis')!==null)return 'store-reports-stock-analysis.read';
 if(staffCompanyReportProductId(path,'sales-analysis')!==null)return 'store-reports-sales-analysis.read';
 return null;
}
export function companyReportKindForStoreCapability(capability){return storeReportCapabilities.includes(capability)?capability.slice('store-'.length):null;}
