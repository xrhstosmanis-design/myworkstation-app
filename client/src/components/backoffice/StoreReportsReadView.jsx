import React from 'react';
import CompanyReportsReadView from './CompanyReportsReadView.jsx';
import CompanyAuditReportsReadView from './CompanyAuditReportsReadView.jsx';
import CompanyInventoryReportsReadView from './CompanyInventoryReportsReadView.jsx';
import {storeReportKinds,reportReadScope} from './reportReadScope.js';
export default function StoreReportsReadView({capability,store,...props}){
 const kind=storeReportKinds.find(key=>capability==='store-reports-'+key+'.read'),nativeCapability=kind?'reports-'+kind+'.read':'';
 const context=reportReadScope({...props,scopeMode:'STORE',store,capability:nativeCapability});
 if(!context.valid)return <p role="alert">Δεν επιβεβαιώθηκε το προσωπικό δικαίωμα αναφοράς του επιλεγμένου καταστήματος.</p>;
 const Panel=['price-changes','departments','documents','delivery'].includes(kind)?CompanyReportsReadView:['deactivations','sale-deletions','pos-sale-actions','destructions','movements'].includes(kind)?CompanyAuditReportsReadView:CompanyInventoryReportsReadView;
 return <Panel key={JSON.stringify([context.key,props.authorityKey,capability])} {...props} scopeMode="STORE" store={store} capability={nativeCapability}/>;
}
