import React from 'react';
import {createRoot} from 'react-dom/client';
import InvoiceInboxPanel from '../../client/src/components/commerce/InvoiceInboxPanel.jsx';
const item={id:'pdf-fixture',mark:'700001',filename:'TEST-73001.pdf',mimeType:'application/pdf',linkedOrderId:'saved-order',status:'IN_REVIEW',processingStatus:'PENDING',hasAttachment:true};
window.__pdfCalls=[];window.__pdfOpened=[];window.__pdfMode='empty';
const api=async(path,options={})=>{window.__pdfCalls.push({path,method:options.method||'GET',body:options.body});if(path.endsWith('/original')){const state=window.__pdfMode;return {purchaseOrderId:'saved-order',readOnly:state==='readonly',reconciliationRequired:state==='reconcile',pdfReadiness:{version:'MYDATA_PDF_READINESS_V1',storeId:'s',inboxId:item.id,orderId:'saved-order',state:state==='empty'?'NEEDS_READING':state==='readonly'?'READ_ONLY':'HAS_LINES',needsPdfReading:state==='empty',orderLineCount:state==='empty'?0:2,documentLineCount:0}}}if(path.includes('/archive?'))return {items:[item],total:1,archiveTotal:1,suppliers:[]};if(path.includes('/reconcile-pos?'))return {orders:[],files:[]};return {enabled:false,serverAutomatic:true}};
createRoot(document.getElementById('root')).render(<InvoiceInboxPanel api={api} stores={[{id:'s',name:'Synthetic store'}]} onOpenOrder={detail=>window.__pdfOpened.push(detail)}/>);
