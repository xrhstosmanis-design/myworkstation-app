import React,{useRef,useState} from 'react';

export default function StaffKioskPaymentsImport({api,storeId}){
  const [preview,setPreview]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef(false);
  const current=preview?.api===api&&preview.payload.storeId===storeId?preview:null;

  async function run(work){
    if(request.current)return;
    request.current=true;
    setBusy(true);setError('');setNotice('');
    try{await work();}catch(error){setError(error.message);}finally{request.current=false;setBusy(false);}
  }
  function choose(event){
    const input=event.currentTarget,file=input.files?.[0];
    input.value='';
    if(!file)return;
    run(async()=>{
      setPreview(null);
      if(!/\.(xlsx|xls|csv)$/i.test(file.name)||file.size>8*1024*1024)throw Error('Επίλεξε αρχείο Excel ή CSV έως 8 MB.');
      const dataBase64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);
        reader.onerror=()=>reject(Error('Το αρχείο δεν διαβάστηκε.'));
        reader.readAsDataURL(file);
      });
      const payload={storeId,filename:file.name,dataBase64};
      const result=await api('/api/owner-payments/preview-kiosk',{method:'POST',body:JSON.stringify(payload)});
      if(result?.store?.id!==storeId||!result.previewOnly||!result.previewReceipt)throw Error('Δεν επιβεβαιώθηκε η προεπισκόπηση για το επιλεγμένο κατάστημα.');
      setPreview({api,payload:{...payload,previewReceipt:result.previewReceipt},result});
    });
  }
  function confirm(){
    if(!current)return;
    run(async()=>{
      const result=await api('/api/owner-payments/import-kiosk',{method:'POST',body:JSON.stringify(current.payload)});
      if(result?.store?.id!==storeId||result.ok!==true)throw Error('Δεν επιβεβαιώθηκε η εισαγωγή.');
      setPreview(null);setNotice(result.message);
    });
  }

  return <section className="panel staff-panel">
    <h3>Εισαγωγή πληρωμών Kiosk</h3>
    <label>Αρχείο Excel ή CSV <input type="file" accept=".xlsx,.xls,.csv" onChange={choose} disabled={busy}/></label>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {current&&<div>
      <p>{current.result.filename} · {current.result.summary.count} κινήσεις · {new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'}).format(current.result.summary.total)}</p>
      <p>Προμηθευτές {current.result.summary.supplierCount} · Λοιπά έξοδα {current.result.summary.otherCount} · Παραλείφθηκαν {current.result.skipped}</p>
      <table><thead><tr><th>Ημερομηνία</th><th>Περιγραφή</th><th>Ποσό</th></tr></thead>
      <tbody>{current.result.sample.map((row,index)=><tr key={index}><td>{new Date(row.occurredAt).toLocaleDateString('el-GR',{timeZone:'Europe/Athens'})}</td><td>{row.description}</td><td>{row.amount}</td></tr>)}</tbody></table>
      <button type="button" onClick={confirm} disabled={busy}>Οριστική εισαγωγή πληρωμών</button>
      <button type="button" onClick={()=>setPreview(null)} disabled={busy}>Ακύρωση</button>
    </div>}
  </section>;
}
