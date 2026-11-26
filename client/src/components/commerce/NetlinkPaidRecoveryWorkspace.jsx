import React,{useState} from 'react';
import NetlinkPosPanel from './NetlinkPosPanel.jsx';
import {useNetlinkPaidCheckout} from './useNetlinkPaidCheckout.jsx';
const euro=n=>Number(n).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
// Owner/manager entry to existing paid records only. There is no new checkout.
export default function NetlinkPaidRecoveryWorkspace({api,storeId,storeName,onClose}){
 const [feedback,setFeedback]=useState('');
 const netlink=useNetlinkPaidCheckout({api,storeId,storeName,operatorId:'backoffice-paid-recovery',getCheckoutId:()=>null,onError:setFeedback,onMessage:setFeedback});
 return <><NetlinkPosPanel api={api} storeId={storeId} storeName={storeName} onClose={onClose} onRecover={netlink.recover} externalMessage={feedback}/>{netlink.voucher&&<div className="netlink-pos-overlay" role="dialog" aria-modal="true"><section className="netlink-voucher-dialog"><h3>Η κάρτα εκδόθηκε</h3><p>{netlink.voucher.title}</p><p>Αξία κάρτας {euro(netlink.voucher.amount)} · παροχή {euro(netlink.voucher.serviceFeeAmount)}</p><p>Σύνολο {euro(netlink.voucher.customerTotal)}</p><p>Εκτύπωση της ίδιας κάρτας, χωρίς νέα αγορά ή απόδειξη.</p><button onClick={netlink.printVoucher}>Εκτύπωση κάρτας</button><button onClick={netlink.closeVoucher}>Κλείσιμο κάρτας</button></section></div>}</>;
}
