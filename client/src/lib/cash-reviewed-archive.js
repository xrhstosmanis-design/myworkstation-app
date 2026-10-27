const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function cashArchivePreviewPayload(report){
  if(typeof report?.text!=='string'||report.text.length>150000||!Array.isArray(report.rows)||report.rows.length>200)throw Error('Δεν είναι διαθέσιμη η ίδια αναφορά.');
  return JSON.stringify({text:report.text,identities:report.rows.map(r=>({sessionId:r.sessionId,employeeKey:r.employeeKey,identityRequiresReview:r.identityRequiresReview}))});
}
export async function fetchCashArchive(api,receipt,{isCurrent=()=>true,cryptoImpl=globalThis.crypto}={}){
  const {storeId,from,to,generation,head,reportHash}=receipt;
  if(typeof storeId!=='string'||!storeId||!/^20\d{2}-\d{2}-\d{2}$/.test(from)||!/^20\d{2}-\d{2}-\d{2}$/.test(to)||typeof generation!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(generation)||!hash(reportHash)||head!=='ROOT'&&!hash(head))throw Error('Ανανέωσε τον έλεγχο πριν από την εξαγωγή.');
  if(!isCurrent())return null;
  const digest=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(cashArchivePreviewPayload(receipt.report))),previewHash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(!isCurrent())return null;
  const result=await api(`/api/cash-reconciliation/stores/${encodeURIComponent(storeId)}/archive?${new URLSearchParams({from,to,generation,head,reportHash,previewHash})}`);
  if(!isCurrent())return null;
  const filename=`cash-reviewed-${from}-${to}.xlsx`;
  if(result?.storeId!==storeId||result.period?.from!==from||result.period?.to!==to||result.generation!==generation||result.head!==head||result.reportHash!==reportHash||result.previewHash!==previewHash||result.mimeType!==mime||result.filename!==filename||typeof result.base64!=='string'||result.base64.length>12*1024*1024||!/^UEsDB[A-Za-z0-9+/]*={0,2}$/.test(result.base64))throw Error('Δεν επιβεβαιώθηκε το αρχείο της ίδιας αναφοράς. Ανανέωσε τον έλεγχο.');
  const binary=atob(result.base64);if(binary.length>8*1024*1024)throw Error('Το αρχείο υπερβαίνει το όριο εξαγωγής.');
  return {blob:new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:mime}),filename};
}
export function saveCashArchive(download,{documentImpl=document,urlImpl=URL}={}){
  const url=urlImpl.createObjectURL(download.blob),link=documentImpl.createElement('a');
  try{link.href=url;link.download=download.filename;documentImpl.body.appendChild(link);link.click();}finally{link.remove();urlImpl.revokeObjectURL(url);}
}
