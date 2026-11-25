const euro=v=>Number(v||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const date=v=>v?new Date(v).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false}):'—';
export function printNetlinkReport(browser,{storeId,storeName,from,to,tab,detail,summary,settlement}){
  if(!storeId||!from||!to||!['detail','summary','weekly'].includes(tab))return false;
  const data=tab==='detail'?detail:tab==='summary'?summary:settlement;
  if(!data)return false;
  const popup=browser.open('','_blank');if(!popup)return false;
  try{
    popup.opener=null;
    const doc=popup.document,el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n};
    const title={detail:'Αναλυτική ημερήσια',summary:'Συνοπτική ημερήσια',weekly:'Εβδομαδιαία εκκαθάριση'}[tab];
    doc.title=`Netlink — ${title}`;doc.documentElement.lang='el';
    doc.head.append(el('style','@page{size:58mm 297mm;margin:3mm}body{width:52mm;margin:0;font:9pt sans-serif;color:#000}h1{font-size:12pt}h2{font-size:10pt}p{overflow-wrap:anywhere;margin:4px 0}section{border-top:1px dashed #000;padding:5px 0;break-inside:avoid}'));
    doc.body.append(el('h1','MyWorkStation · Netlink'),el('h2',title),el('p',storeName||'Επιλεγμένο κατάστημα'),el('p',`Αναγνωριστικό καταστήματος: ${storeId}`),el('p',`${from} — ${to}`),el('p','Εσωτερική αναφορά MyWorkStation — δεν αποτελεί statement της Netlink.'));
    const section=values=>{const n=el('section');for(const [label,value] of values)n.append(el('p',`${label}: ${value??'—'}`));doc.body.append(n)};
    if(tab==='detail'){
      const totals=detail.totals||{};
      section([['Ολοκληρωμένες',totals.completed||0],['Αξία καρτών',euro(totals.cardAmount)],['Σύνολο πελάτη',euro(totals.customerTotal)],['Αιτήματα ακύρωσης',totals.cancellationRequests||0]]);
      for(const r of detail.items||[])section([['Ημερομηνία',date(r.completedAt||r.createdAt)],['Χειριστής',r.operatorName],['Προϊόν',r.productId],['Αναφορά',r.providerReference||r.providerTransactionId||r.requestId],['Αξία',euro(r.amount)],['Κατάσταση',r.status],['Ακύρωση',r.cancellationStatus]]);
      if(!detail.items?.length)doc.body.append(el('p','Δεν βρέθηκαν συναλλαγές για το επιλεγμένο διάστημα.'));
    }else{
      if(tab==='weekly'){const w=settlement.settlement||{};section([['Συναλλαγές',w.transactions||0],['Αξία καρτών',euro(w.grossAmount)],['Υπηρεσία',euro(w.serviceFees)],['Σύνολο πελάτη',euro(w.customerTotal)],['Προμήθεια',euro(w.commissionAmount)]]);doc.body.append(el('p','Η τελική συμφωνία εκκρεμεί μέχρι το statement της Netlink.'))}
      const rows=tab==='summary'?summary.days:settlement.dailyBreakdown;
      for(const r of rows||[])section([['Ημέρα',r.date],['Συναλλαγές',r.transactions],['Αξία καρτών',euro(r.grossAmount)],['Προμήθεια',euro(r.commissionAmount)]]);
      if(!rows?.length)doc.body.append(el('p','Δεν βρέθηκαν συναλλαγές για το επιλεγμένο διάστημα.'));
    }
    popup.addEventListener('afterprint',()=>popup.close(),{once:true});popup.focus();popup.print();return true;
  }catch{popup.close();return false}
}
