import React,{useEffect,useMemo,useRef,useState} from 'react';
const saved=key=>{try{const value=JSON.parse(window.sessionStorage.getItem(key)||'null');return value?.version===1&&value.body?.requestId?value.body:null}catch{return null}};
export default function InventoryReviewControls({api,report,stocktakeId,storeId,onRefresh,onLockChange}){
  const key=`mws:inventory-review:${JSON.stringify([storeId,stocktakeId,report.previous.id,report.viewerId,report.generation])}`;
  const [pending,setPending]=useState(()=>saved(key)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[first,setFirst]=useState(''),[second,setSecond]=useState(''),[revokeTarget,setRevokeTarget]=useState(null);
  const alive=useRef(true),scope=useRef(key),pendingRef=useRef(pending),busyRef=useRef(false);
  scope.current=key;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;onLockChange?.(false);};},[onLockChange]);
  useEffect(()=>{const value=saved(key);pendingRef.current=value;setPending(value);setError('');setNotice('');},[key]);
  useEffect(()=>{onLockChange?.(Boolean(pending||busy));},[pending,busy,onLockChange]);
  const clear=(oldKey=key)=>{try{window.sessionStorage.removeItem(oldKey)}catch{}if(alive.current&&scope.current===oldKey){pendingRef.current=null;setPending(null);onLockChange?.(false);}};
  const send=async body=>{
    if(busyRef.current)return;
    busyRef.current=true;onLockChange?.(true);setBusy(true);setError('');setNotice('');const requestScope=key;
    try{
      const result=await api(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/reconciliation/reviews`,{method:'POST',body:JSON.stringify(body)});
      if(result.ok!==true||result.requestId!==body.requestId)throw new Error('Η καταχώριση δεν επιβεβαιώθηκε. Κάνε επαλήθευση.');
      clear(requestScope);
      if(alive.current&&scope.current===requestScope)await onRefresh();
    }catch(e){if(alive.current&&scope.current===requestScope)setError(`${e.message} Επαλήθευσε την καταχώριση πριν από νέα ενέργεια.`);}
    finally{busyRef.current=false;if(alive.current&&scope.current===requestScope)setBusy(false);}
  };
  const submit=(event,kind)=>{
    event.preventDefault();if(pendingRef.current||busyRef.current)return;
    const form=new FormData(event.currentTarget),reason=String(form.get('reason')||'').trim(),evidence=String(form.get('evidence')||'').trim();
    if(reason.length<3||reason.length>500||evidence.length<5||evidence.length>500){setError('Συμπλήρωσε αιτιολογία και συγκεκριμένη τεκμηρίωση.');return;}
    let action={kind,reason,evidence};
    if(kind==='LINK'){
      if(!first||!second||first===second){setError('Επίλεξε δύο διαφορετικούς κωδικούς.');return;}
      action={...action,productIds:[first,second],canonicalProductId:String(form.get('canonical')||first)};
    }else if(kind==='CORRECTION'){
      const raw=String(form.get('quantity')||'').trim(),quantity=Number(raw),productId=String(form.get('product')||'');
      if(!raw||!Number.isFinite(quantity)||quantity===0||Math.abs(quantity)>10000000||Math.abs(quantity*10000-Math.round(quantity*10000))>0.000001||!productId){setError('Συμπλήρωσε είδος και μη μηδενική διόρθωση με έως 4 δεκαδικά.');return;}
      action={...action,productId,quantity};
    }else action={...action,actionId:revokeTarget};
    if(!window.confirm('Επιβεβαιώνεις την ενέργεια για αυτή τη σύγκριση; Η ενέργεια ενημερώνει την αναφορά και το ιστορικό ελέγχου.'))return;
    const body={requestId:crypto.randomUUID(),previousStocktakeId:report.previous.id,generation:report.generation,head:report.review.head,expectedFingerprint:report.fingerprint,action};
    try{window.sessionStorage.setItem(key,JSON.stringify({version:1,body}));}catch{setError('Δεν μπορεί να διατηρηθεί με ασφάλεια η ταυτότητα της ενέργειας. Δεν στάλθηκε καταχώριση.');return;}
    pendingRef.current=body;setPending(body);send(body);
  };
  const verify=async()=>{
    const body=pendingRef.current;if(!body||busyRef.current)return;
    const requestScope=key;busyRef.current=true;setBusy(true);setError('');
    try{
      const result=await api(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/reconciliation?reportVersion=2&previousStocktakeId=${encodeURIComponent(body.previousStocktakeId)}`);
      if(!alive.current||scope.current!==requestScope)return;
      if(result.current?.id!==stocktakeId||result.current?.storeId!==storeId||result.viewerId!==report.viewerId)throw new Error('Η απάντηση δεν αντιστοιχεί στην ενεργή πρόσβαση.');
      const receipt=result.review?.history?.find(r=>r.requestId===body.requestId&&r.actorId===report.viewerId);
      if(receipt){clear(requestScope);await onRefresh();}
      else if(result.review?.head!==body.head||result.generation!==body.generation){clear(requestScope);await onRefresh();}
      else setNotice('Δεν βρέθηκε ακόμη καταχώριση. Μπορείς να επαναλάβεις μόνο την ίδια αποθηκευμένη ενέργεια.');
    }catch(e){if(alive.current&&scope.current===requestScope)setError(e.message);}
    finally{busyRef.current=false;if(alive.current&&scope.current===requestScope)setBusy(false);}
  };
  const discard=async()=>{
    if(busyRef.current||!window.confirm('Η ενέργεια μπορεί να έχει ήδη καταχωριστεί. Θα ανανεωθεί η αναφορά· η ακύρωση της φόρμας δεν αναιρεί καταχωρισμένη επιβεβαίωση.'))return;
    clear();await onRefresh();
  };
  const fields=<><label>Αιτιολογία <input name="reason" required minLength={3} maxLength={500}/></label><label>Τεκμηρίωση μέτρησης ή ταύτισης <input name="evidence" required minLength={5} maxLength={500}/></label></>;
  const codes=useMemo(()=>new Map(report.rows.map(r=>[r.productId,r.sku])),[report.rows]);
  const code=id=>codes.get(id)||id;
  const actionLabel=action=>action.kind==='LINK'?`Σύνδεση ${action.productIds.map(code).join(' + ')} · κύριος ${code(action.canonicalProductId)}`:action.kind==='CORRECTION'?`Διόρθωση ${code(action.productId)} · ${action.quantity} τμχ`:'Ανάκληση';
  return <section aria-label="Επιβεβαιώσεις απογραφής">
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {pending?<div><p>Υπάρχει ενέργεια προς επαλήθευση. Διατηρείται η ίδια ταυτότητα καταχώρισης.</p><button disabled={busy} onClick={verify}>Επαλήθευση καταχώρισης</button> <button disabled={busy} onClick={()=>send(pendingRef.current)}>Επανάληψη ίδιας ενέργειας</button> <button disabled={busy} onClick={discard}>Ανανέωση και ακύρωση φόρμας</button></div>:<>
      <p>Οι επιβεβαιώσεις ισχύουν για αυτή τη σύγκριση. Οι αρχικές καταμετρήσεις διατηρούνται. Η διόρθωση της αναφοράς είναι ξεχωριστή από καταχώριση αποθέματος.</p>
      <details><summary>Επιβεβαίωση ίδιου φυσικού προϊόντος</summary><form onSubmit={e=>submit(e,'LINK')}>
        <label>Πρώτος κωδικός <select required value={first} onChange={e=>setFirst(e.target.value)}><option value="">Επιλογή</option>{report.rows.map(r=><option key={r.productId} value={r.productId}>{r.sku} · {r.name}</option>)}</select></label>
        <label>Δεύτερος κωδικός <select required value={second} onChange={e=>setSecond(e.target.value)}><option value="">Επιλογή</option>{report.rows.map(r=><option key={r.productId} value={r.productId}>{r.sku} · {r.name}</option>)}</select></label>
        <label>Κύριος κωδικός για αποτίμηση <select name="canonical" required key={`${first}:${second}`}>{[...new Set([first,second].filter(Boolean))].map(id=><option key={id} value={id}>{report.rows.find(r=>r.productId===id)?.sku} · {report.rows.find(r=>r.productId===id)?.name}</option>)}</select></label>
        {fields}<button disabled={busy}>Επιβεβαίωση σύνδεσης</button>
      </form></details>
      <details><summary>Διόρθωση αποτελέσματος καταμέτρησης</summary><form onSubmit={e=>submit(e,'CORRECTION')}>
        <label>Είδος διόρθωσης <select name="product" required><option value="">Επιλογή</option>{report.rows.filter(r=>r.difference!==null).map(r=><option key={r.productId} value={r.productId}>{r.sku} · {r.name}</option>)}</select></label>
        <label>Διόρθωση τεμαχίων <input name="quantity" type="number" step="0.0001" required placeholder="π.χ. 240 ή -10"/></label>
        {fields}<button disabled={busy}>Καταχώριση διόρθωσης αναφοράς</button>
      </form></details>
      {report.review.history.some(r=>r.active)&&<details><summary>Ανάκληση προηγούμενης επιβεβαίωσης</summary><form onSubmit={e=>submit(e,'REVOKE')}>
        <label>Επιβεβαίωση για ανάκληση <select required value={revokeTarget||''} onChange={e=>setRevokeTarget(e.target.value)}><option value="">Επιλογή</option>{report.review.history.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{actionLabel(r.action)} · {r.actorName} · {r.action.reason}</option>)}</select></label>
        {fields}<button disabled={busy}>Ανάκληση επιβεβαίωσης</button>
      </form></details>}
    </>}
  </section>;
}
