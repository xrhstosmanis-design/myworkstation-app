const VERSION='MYDATA_PRINTED_ECONOMICS_V1';
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=160&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);

// This is a read-only explanation of server evidence, never a discount calculator.
export function myDataPrintedEconomicsNotice(dto,{orderId,storeId}={}){
  if(!validId(orderId)||!validId(storeId)||!dto||dto.version!==VERSION||dto.orderId!==orderId||dto.storeId!==storeId||!Number.isInteger(dto.lineCount)||dto.lineCount<0||dto.lineCount>1000000)return null;
  if(dto.state==='VERIFIED'){
    const amount=dto.discountAmountTotal;
    if(dto.lineCount<1||dto.lineCount>250||!(typeof amount==='string'&&/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)||typeof amount==='number'&&Number.isFinite(amount)&&amount>=0&&amount<=999999999999.99&&Math.abs(amount*100-Math.round(amount*100))<0.0001))return null;
    const value=Number(amount);
    if(!Number.isFinite(value)||value<0)return null;
    return {state:'VERIFIED',text:`Η αρχική τιμή και η τυπωμένη έκπτωση επιβεβαιώθηκαν από το πρωτότυπο σε ${dto.lineCount} γραμμές. Συνολικό ποσό τυπωμένων εκπτώσεων: ${value.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})} €. Τα ποσοστά που χρησιμοποιούνται για την αποθήκευση του ποσού είναι ισοδύναμος υπολογισμός, όχι τυπωμένα ποσοστά έκπτωσης.`};
  }
  if(dto.state!=='UNKNOWN')return null;
  const changed=dto.reason==='STALE_ROWS'?'Οι γραμμές άλλαξαν μετά την αυτόματη επιβεβαίωση. ':dto.reason==='STALE_SOURCE'?'Τα στοιχεία της πηγής άλλαξαν μετά την αυτόματη επιβεβαίωση. ':'';
  return {state:'UNKNOWN',text:`${changed}Η αρχική τιμή και οι εκπτώσεις προμηθευτή δεν έχουν επιβεβαιωθεί από το πρωτότυπο. Η τιμή μπορεί να προέρχεται από καθαρή αξία διά ποσότητα. Η ένδειξη 0 στην έκπτωση δεν αποδεικνύει ότι ο προμηθευτής δεν έδωσε έκπτωση. Ελέγξτε το πρωτότυπο πριν από την καταχώριση.`};
}

export function installMyDataPrintedEconomicsNotice(container,dto,context){
  container?.querySelectorAll('[data-mydata-printed-economics]').forEach(node=>node.remove());
  const notice=myDataPrintedEconomicsNotice(dto,context),anchor=container?.querySelector('.po-order-meta');
  if(!notice||!anchor)return null;
  const node=anchor.ownerDocument.createElement('p');
  node.className='po-learning-notice';
  node.setAttribute('role','status');
  node.setAttribute('data-mydata-printed-economics',notice.state);
  node.textContent=notice.text;
  anchor.insertAdjacentElement('afterend',node);
  return node;
}
