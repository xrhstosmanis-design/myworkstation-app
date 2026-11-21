import {withReportSecurityCompatibility} from './automatic-report-security-transition.js';
import {withExpectedReceiptProfile,EXPECTED_RECEIPT_TARGET_PROFILE,EXPECTED_RECEIPT_SOURCE_PROFILE} from './supplier-expected-receipts-lifecycle-profile.js';
import {withReportOperationalCompatibility,withReportColumnCompatibility,withReportChatCompatibility} from './automatic-report-operational-profile.js';
import {withAutomaticReportEventConsent} from './automatic-report-event-schema.js';
import {backofficeCompanyProfile} from './backoffice-company-profile.js';
// Static reviewed ownership documents. Selection does not install or enable anything.
import {readFileSync} from 'node:fs';
const baseUrl=new URL('../../../ops/backup/lifecycle/manifest.json',import.meta.url);
const captureUrl=new URL('../../../ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json',import.meta.url);
const document=JSON.parse(readFileSync(baseUrl,'utf8'));
// Installation/schema callers rely on this accessor always meaning BASE.
export const reviewedFreshStoreManifest=()=>structuredClone(document);
export function selectedStoreLifecycleManifest(env=process.env){
 const profile=env.MWS_STORE_LIFECYCLE_PROFILE;
 if(profile===EXPECTED_RECEIPT_TARGET_PROFILE)return withExpectedReceiptProfile(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:EXPECTED_RECEIPT_SOURCE_PROFILE}));
 if(['BACKOFFICE_COMPANY_BASE_V1','BACKOFFICE_COMPANY_CAPTURE_V1','BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1'].includes(profile))return backofficeCompanyProfile(env).manifest;
 if(profile===undefined||profile==='BASE')return reviewedFreshStoreManifest();
 if(profile==='AUTOMATIC_EVENT_REPORTS_V1')return withAutomaticReportEventConsent(document);
 if(profile==='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4')return withReportSecurityCompatibility(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'}));
 if(profile==='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3')return withReportChatCompatibility(withReportColumnCompatibility(withReportOperationalCompatibility(withAutomaticReportEventConsent(JSON.parse(readFileSync(captureUrl,'utf8'))))));
 if(profile==='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2')return withReportColumnCompatibility(withReportOperationalCompatibility(withAutomaticReportEventConsent(JSON.parse(readFileSync(captureUrl,'utf8')))));
 if(profile==='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1')return withReportOperationalCompatibility(withAutomaticReportEventConsent(JSON.parse(readFileSync(captureUrl,'utf8'))));
 if(profile==='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1')return withAutomaticReportEventConsent(JSON.parse(readFileSync(captureUrl,'utf8')));
 if(profile==='MONTHLY_INVENTORY_CAPTURE_V1')return JSON.parse(readFileSync(captureUrl,'utf8'));
 throw new Error('Invalid store lifecycle profile.');
}
