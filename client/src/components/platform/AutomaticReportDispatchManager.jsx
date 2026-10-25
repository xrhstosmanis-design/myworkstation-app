import React,{useEffect,useRef,useState} from 'react';

const frequencies=[['DAILY','Ημερήσια'],['WEEKLY','Εβδομαδιαία'],['MONTHLY','Μηνιαία']];
const stamp=value=>value?new Date(value).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false}):'—';

export default function AutomaticReportDispatchManager({company,store,request}){
 const scope=`${company.id}:${store.id}`,current=useRef(scope),sequence=useRef(0);
 current.current=scope;
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [email,setEmail]=useState(''),[selected,setSelected]=useState(['DAILY']),[tokens,setTokens]=useState({}),[ack,setAck]=useState(false);
 const path=`/api/platform/companies/${encodeURIComponent(company.id)}/stores/${encodeURIComponent(store.id)}/report-dispatch`;
 const load=async()=>{
  const id=++sequence.current,captured=scope;setBusy(true);setError('');
  try{const result=await request(path);if(id===sequence.current&&captured===current.current){setData(result);if(result.policy?.allowedFrequencies?.length)setSelected(result.policy.allowedFrequencies)}}
  catch(e){if(id===sequence.current&&captured===current.current)setError(e.message)}
  finally{if(id===sequence.current&&captured===current.current)setBusy(false)}
 };
 useEffect(()=>{setData(null);setEmail('');setTokens({});setAck(false);setMessage('');setSelected(['DAILY']);load();return()=>{sequence.current++}},[scope]);
 const mutate=async(suffix,body,success,method='POST')=>{
  const captured=scope,id=++sequence.current;setBusy(true);setError('');setMessage('');
  try{const result=await request(path+suffix,{method,body:JSON.stringify(body)});if(id!==sequence.current||captured!==current.current)return;setTokens({});setMessage(typeof success==='function'?success(result):success);await load()}
  catch(e){if(id===sequence.current&&captured===current.current)setError(e.message)}
  finally{if(captured===current.current)setBusy(false)}
 };
 const token=(id,kind)=>tokens[`${id}:${kind}`]||'';
 const setToken=(id,kind,value)=>setTokens(old=>({...old,[`${id}:${kind}`]:value}));
 const policy=data?.policy,grant=data?.grant;
 return <section className="report-settings-dispatch" aria-label="Αυτόματες αποστολές αναφορών" style={{borderTop:'1px solid #cbd5e1',marginTop:20,paddingTop:16}}>
  <h3>Αυτόματες αποστολές</h3>
  <p>Κατάστημα: <strong>{store.name}</strong>. Οι αναφορές είναι προσωρινές· δεν αποτελούν οικονομική πιστοποίηση ή χρέωση εργαζομένου.</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {!data&&!error&&<p>Ανάγνωση κατάστασης αποστολών…</p>}
  {data?.schemaReady===false&&<p>Η προετοιμασία αυτόματων αποστολών δεν έχει ολοκληρωθεί. Οι χειροκίνητες αποστολές παραμένουν διαθέσιμες.</p>}
  {data?.schemaReady===true&&<>
   <p><strong>{data.activation?.enabled&&policy?.dispatchEnabled&&grant?.active?'Η αποστολή έχει ενεργοποιηθεί για επιλέξιμες περιόδους.':'Η αυτόματη αποστολή είναι κλειστή ή αναμένει ενεργοποίηση.'}</strong></p>
   <p>Δεν αποστέλλονται παλιές ή ελλιπείς περίοδοι. Έναρξη επιτρεπόμενης περιόδου από {stamp(grant?.notBefore||data.activation?.notBefore)}. Οι αβέβαιες αποστολές δεν επαναλαμβάνονται αυτόματα.</p>
   <fieldset disabled={busy}>
    <legend>Περίοδοι και άδεια αποστολής</legend>
    {frequencies.map(([value,label])=><label key={value} style={{display:'inline-block',marginRight:16}}><input type="checkbox" checked={selected.includes(value)} onChange={e=>setSelected(old=>e.target.checked?[...old,value]:old.filter(x=>x!==value))}/>{label}</label>)}
    <label style={{display:'block',margin:'12px 0'}}><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Εξουσιοδοτώ την αυτόματη αποστολή προσωρινών αναφορών μόνο για αυτό το κατάστημα και τις επιλεγμένες περιόδους.</label>
    <button type="button" disabled={!ack||!selected.length} onClick={()=>mutate('/grant',{expectedRevision:grant?.revision||0,active:true,allowedFrequencies:selected,explicitAuthorization:true},'Η εξουσιοδότηση αποθηκεύτηκε. Απαιτείται και συγκατάθεση παραλήπτη.','PUT')}>Αποθήκευση εξουσιοδότησης</button>{' '}
    <button type="button" disabled={!ack||!selected.length||!grant?.active} onClick={()=>mutate('/policy',{expectedRevision:policy?.revision||0,dispatchEnabled:true,allowsProvisional:true,allowedFrequencies:selected},'Οι ρυθμίσεις αποθηκεύτηκαν. Η αποστολή γίνεται μόνο όταν πληρούνται όλοι οι έλεγχοι.','PUT')}>Ενεργοποίηση επιλεγμένων περιόδων</button>{' '}
    <button type="button" onClick={()=>mutate('/policy',{expectedRevision:policy?.revision||0,dispatchEnabled:false,allowsProvisional:policy?.allowsProvisional||false,allowedFrequencies:policy?.allowedFrequencies||[]},'Οι αυτόματες αποστολές του καταστήματος έκλεισαν.','PUT')}>Κλείσιμο αυτόματων αποστολών</button>
   </fieldset>
   <fieldset disabled={busy} style={{marginTop:16}}>
    <legend>Παραλήπτες και συγκατάθεση</legend>
    <p>Συμπλήρωσε το email και πάτησε Αποθήκευση. Ο παραλήπτης λαμβάνει μία πρόσκληση και επιβεβαιώνει από τον σύνδεσμο, χωρίς αντιγραφή κωδικών. Ήδη επιβεβαιωμένο email με ενεργή συγκατάθεση διατηρείται.</p>
    <label>Νέο email<input aria-label="Νέο email αυτόματων αναφορών" type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <button type="button" disabled={!email||!selected.length} onClick={()=>{const existing=data.recipients?.find(x=>!x.recipient.revokedAt&&x.recipient.email===email.trim().toLowerCase())?.recipient;mutate('/invitations',{email,expectedVersion:existing?.version||0,...(existing?{recipientId:existing.recipientId}:{}),allowedFrequencies:selected},r=>r.alreadyConfirmed?'Το email και η ενεργή συγκατάθεση διατηρήθηκαν. Δεν στάλθηκε νέα πρόσκληση.':'Η πρόσκληση στάλθηκε. Ο παραλήπτης επιβεβαιώνει από το email του.')}}>Αποθήκευση email</button>
    <details><summary>Παλαιά επιβεβαίωση με κωδικό</summary>
    <button type="button" disabled={!email||data.recipients?.filter(x=>!x.recipient.revokedAt).length>=5} onClick={()=>mutate('/recipients',{email,expectedVersion:0},'Ο παραλήπτης προστέθηκε χωρίς επιβεβαίωση.','PUT')}>Προσθήκη παραλήπτη</button>
    </details>
    {(data.recipients||[]).map(({recipient:r,consent})=><div key={r.recipientId} style={{padding:'14px 0',borderTop:'1px solid #e2e8f0'}}>
     <strong>{r.email}</strong> · {r.revokedAt?'Ανακλημένος':r.verifiedAt?'Επιβεβαιωμένο email':'Μη επιβεβαιωμένο email'} · {consent?.active?'Ενεργή συγκατάθεση':'Χωρίς ενεργή συγκατάθεση'}
     {!r.revokedAt&&<>
      {(!r.verifiedAt||!consent?.active||selected.some(f=>!consent.allowedFrequencies?.includes(f)))&&<button type="button" disabled={!selected.length} onClick={()=>mutate('/invitations',{email:r.email,recipientId:r.recipientId,expectedVersion:r.version,allowedFrequencies:selected},'Η πρόσκληση στάλθηκε. Επιβεβαίωσε από τον σύνδεσμο του email.')}>Αποστολή πρόσκλησης</button>}
      <details><summary>Παλαιά επιβεβαίωση με κωδικό</summary>
      <div><button type="button" onClick={()=>mutate(`/recipients/${encodeURIComponent(r.recipientId)}/verification`,{expectedVersion:r.version},'Στάλθηκε αίτημα επιβεβαίωσης. Ο κωδικός ισχύει για 10 λεπτά.')}>Αποστολή κωδικού email</button>{' '}
       <label>Κωδικός email<input aria-label={`Κωδικός email ${r.email}`} autoComplete="off" maxLength={32} value={token(r.recipientId,'verify')} onChange={e=>setToken(r.recipientId,'verify',e.target.value)}/></label>{' '}
       <button type="button" disabled={!/^[a-f0-9]{32}$/.test(token(r.recipientId,'verify'))} onClick={()=>mutate(`/recipients/${encodeURIComponent(r.recipientId)}/verification/confirm`,{expectedVersion:r.version,token:token(r.recipientId,'verify')},'Η διεύθυνση επιβεβαιώθηκε. Δεν έχει δοθεί ακόμη συγκατάθεση.')}>Επιβεβαίωση email</button>
      </div>
      <div><button type="button" disabled={!r.verifiedAt||!selected.length} onClick={()=>mutate(`/recipients/${encodeURIComponent(r.recipientId)}/consent/request`,{expectedVersion:r.version,allowedFrequencies:selected},'Στάλθηκε χωριστό αίτημα συγκατάθεσης για τις επιλεγμένες περιόδους.')}>Αίτημα συγκατάθεσης παραλήπτη</button>{' '}
       <label>Κωδικός συγκατάθεσης<input aria-label={`Κωδικός συγκατάθεσης ${r.email}`} autoComplete="off" maxLength={32} value={token(r.recipientId,'consent')} onChange={e=>setToken(r.recipientId,'consent',e.target.value)}/></label>{' '}
       <button type="button" disabled={!r.verifiedAt||!ack||!/^[a-f0-9]{32}$/.test(token(r.recipientId,'consent'))} onClick={()=>mutate(`/recipients/${encodeURIComponent(r.recipientId)}/consent/confirm`,{expectedVersion:r.version,expectedRevision:consent?.revision||0,token:token(r.recipientId,'consent'),explicitConsent:true},'Η συγκατάθεση καταγράφηκε για τις περιόδους που ενέκρινε ο παραλήπτης.')}>Καταγραφή συγκατάθεσης με κωδικό</button>
      </div>
      </details>
      <button type="button" onClick={()=>mutate(`/recipients/${encodeURIComponent(r.recipientId)}/consent`,{expectedRecipientVersion:r.version,expectedRevision:consent?.revision||0,active:false,allowedFrequencies:[],explicitConsent:false},'Η συγκατάθεση ανακλήθηκε.','PUT')}>Ανάκληση συγκατάθεσης</button>{' '}
      <button type="button" onClick={()=>mutate(`/recipients/${encodeURIComponent(r.recipientId)}`,{expectedVersion:r.version},'Ο παραλήπτης ανακλήθηκε.','DELETE')}>Ανάκληση παραλήπτη</button>
     </>}
    </div>)}
   </fieldset>
  </>}
  <button type="button" disabled={busy} onClick={load}>Ανανέωση κατάστασης αποστολών</button>
 </section>;
}
