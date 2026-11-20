import React from 'react';
import {staffCompanyCapabilities} from '../../../../shared/backoffice-staff-company.mjs';
export function companyAuthoritySupported(authority){
 if(!authority||authority.protocol!=='MWS_BACKOFFICE_COMPANY_V1'||!Array.isArray(authority.capabilities)||authority.capabilities.length!==staffCompanyCapabilities.length||!staffCompanyCapabilities.every(key=>authority.capabilities.includes(key)))return false;
 if(!Object.hasOwn(authority,'readiness'))return true;
 const r=authority.readiness;return Boolean(r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).length===4&&r.protocol==='MWS_BACKOFFICE_COMPANY_READ_CAPABILITY_V1'&&r.profile==='CURRENT_CAPTURE'&&r.scope==='COMPANY_READ_ONLY'&&r.scopedRecovery===false);
}
export default function CompanyAuthorityReadiness({authority}){
 if(!companyAuthoritySupported(authority))return <p role="status" aria-label="Διαθεσιμότητα εταιρικών προβολών">Δεν επιβεβαιώθηκε η διαθεσιμότητα εταιρικών προβολών για την παρούσα πρόσβαση.</p>;
 if(!authority.readiness)return null;
 return <p role="status" aria-label="Διαθεσιμότητα εταιρικών προβολών">Οι εταιρικές προβολές είναι διαθέσιμες σύμφωνα με τα παραχωρημένα δικαιώματα. Η επιβεβαίωση αφορά μόνο εταιρικές αναγνώσεις· δεν επιβεβαιώνει διαγραφή, επαναφορά ή ανάκτηση δεδομένων.</p>;
}
