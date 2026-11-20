import {storeReportNames} from '../../../../shared/backoffice-staff-reports.mjs';
export const storeReportKinds=storeReportNames;
export function reportReadScope({scopeMode='COMPANY',companyId,capability,store}){
 if(scopeMode==='COMPANY')return{valid:typeof companyId==='string'&&Boolean(companyId),mode:'COMPANY',companyId,storeId:null,headers:{'x-backoffice-company-id':companyId},key:JSON.stringify(['COMPANY',companyId])};
 const kind=typeof capability==='string'?capability.replace(/^reports-/,'').replace(/\.read$/,''):'';
 const valid=scopeMode==='STORE'&&storeReportKinds.includes(kind)&&typeof companyId==='string'&&Boolean(companyId)&&typeof store?.id==='string'&&Boolean(store.id)&&typeof store?.name==='string'&&Array.isArray(store.capabilities)&&store.capabilities.includes('store-reports-'+kind+'.read');
 return{valid,mode:'STORE',companyId,storeId:store?.id??null,headers:{'x-backoffice-store-id':store?.id},key:JSON.stringify(['STORE',companyId,store?.id,store?.name,store?.capabilities])};
}
