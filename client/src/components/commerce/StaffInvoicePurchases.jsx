import React,{useEffect,useRef} from 'react';
import {mountPosPurchaseOrders} from './installPurchaseOrdersSuite.js';
import './purchase-orders-suite.css';
import {invoiceProductCardCapability,invoiceProductBarcodesCapability} from '../../../../shared/backoffice-staff-company.mjs';
export default function StaffInvoicePurchases({api,store,capabilities,companyCapabilities}){
 const host=useRef(null);
 const canEditCompanyProduct=companyCapabilities?.includes(invoiceProductCardCapability);
 const canEditCompanyBarcodes=companyCapabilities?.includes(invoiceProductBarcodesCapability);
 useEffect(()=>mountPosPurchaseOrders(host.current,{request:api,store,staffCapabilities:capabilities,canEditCompanyProduct,canEditCompanyBarcodes}),[api,store.id,capabilities,canEditCompanyProduct,canEditCompanyBarcodes]);
 return <section aria-label="Αγορές και πρόχειρα τιμολογίων" ref={host}/>;
}
