import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createReportInstallerSession} from './report-event-installation-context.mjs';

export default function ReportEventInstallationManager({company,store,request}){
 const [profile,setProfile]=useState('');
 const session=useMemo(()=>createReportInstallerSession({storage:typeof window==='undefined'?null:window.localStorage,sessions:typeof window==='undefined'?null:window.sessionStorage}),[]);
 useEffect(()=>{session.capture();},[session]);
 return <details>
  <summary>Προετοιμασία αναφορών προσφορών και απογραφής</summary>
  <label>Υπάρχουσα διαμόρφωση
   <select aria-label="Υπάρχουσα διαμόρφωση αναφορών" value={profile} onChange={event=>setProfile(event.target.value)}>
    <option value="">Επίλεξε διαμόρφωση</option>
    <option value="BASE">Βασική εγκατάσταση</option>
    <option value="CAPTURE">Εγκατάσταση με μηνιαία καταγραφή απογραφής</option>
    <option value="CAPTURE_REPORTS_ONLY">Μηνιαία καταγραφή και συμβατότητα λειτουργικών πινάκων μόνο για αναφορές</option>
    <option value="CAPTURE_REPORTS_ONLY_V2">Ενημερωμένη διαμόρφωση συμβατότητας αναφορών</option>
   </select>
  </label>
  {profile&&<Installation key={company.id+':'+store.id+':'+profile} company={company} store={store} request={request} profile={profile} session={session}/>}
 </details>;
}

function Installation({company,store,request,profile,session}){
 const [packet,setPacket]=useState(null),[busy,setBusy]=useState(false),[ack,setAck]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const alive=useRef(true),pending=useRef(false),packetContext=useRef(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>session.watch(()=>{packetContext.current=null;setPacket(null);setAck(false);setMessage('');setError('Η συνεδρία άλλαξε. Επανέλαβε τον προέλεγχο εγκατάστασης.');},window,document),[session]);
 const base=`/api/platform/companies/${encodeURIComponent(company.id)}/stores/${encodeURIComponent(store.id)}/report-event-installation`;
 async function run(install){
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');setMessage('');setAck(false);
  const approvedPacket=packet;setPacket(null);
  try{
   const current=session.context();
   const scopedRequest=session.bind(request,base,current);
   if(install){
    if(packetContext.current!==current.key)throw new Error('Η συνεδρία άλλαξε. Επανέλαβε τον προέλεγχο εγκατάστασης.');
    if(!approvedPacket||!ack)return;
    const result=await scopedRequest(base+'/install',{method:'POST',body:JSON.stringify({profile,packet:approvedPacket,explicitAuthorization:true})});
    if(!alive.current)return;
    if(result?.installed!==true)throw new Error('Η εγκατάσταση δεν επιβεβαιώθηκε. Επανέλαβε τον έλεγχο κατάστασης.');
    setMessage('Η προετοιμασία εγκαταστάθηκε. Ανανέωσε την κατάσταση αποστολών για να ορίσεις παραλήπτες και εξουσιοδότηση.');
   }else{
    const description=await scopedRequest(base+'/describe?profile='+profile);
    if(!alive.current)return;
    const result=await scopedRequest(base+'/inspect',{method:'POST',body:JSON.stringify({profile})});
    if(!alive.current)return;
    const next=result?.packet;
    if(result.eligible!==true||next?.companyId!==company.id||next?.storeId!==store.id||next?.profile!==profile||
      !/^[a-f0-9]{40}$/.test(next?.sourceRevision||'')||!['oldPlanHash','targetPlanHash'].every(key=>/^[a-f0-9]{64}$/.test(next?.[key]||''))||
      ['sourceRevision','oldPlanHash','targetPlanHash','profile'].some(key=>next[key]!==description?.[key])){
     throw new Error('Ο έλεγχος δεν επιβεβαίωσε την επιλεγμένη εγκατάσταση. Επανέλαβε τον έλεγχο.');
    }
    packetContext.current=current.key;
    setPacket(next);
   }
  }catch(reason){if(alive.current)setError(reason?.message||'Η προετοιμασία δεν επιβεβαιώθηκε. Επανέλαβε τον έλεγχο.');}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 return <section aria-label="Εγκατάσταση αυτόματων αναφορών">
  {['CAPTURE_REPORTS_ONLY','CAPTURE_REPORTS_ONLY_V2'].includes(profile)&&<p>Το προφίλ επιτρέπει την προετοιμασία αναφορών. Η επαναφορά, εξαγωγή και διαγραφή επιλεγμένου καταστήματος παραμένουν μη διαθέσιμες μέχρι να ολοκληρωθεί ο έλεγχος των λειτουργικών πινάκων.</p>}
  <p>Εταιρεία {company.name||company.id} · Κατάστημα {store.name||store.id}</p>
  <button type="button" disabled={busy} onClick={()=>run(false)}>Έλεγχος εγκατάστασης αναφορών</button>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {packet&&<>
   <dl style={{overflowWrap:'anywhere'}}>
    <dt>Εταιρεία / κατάστημα</dt><dd>{packet.companyId} / {packet.storeId}</dd>
    <dt>Έκδοση διακομιστή</dt><dd>{packet.sourceRevision}</dd>
    <dt>Υπάρχον σχέδιο εγκατάστασης</dt><dd>{packet.oldPlanHash}</dd>
    <dt>Νέο σχέδιο εγκατάστασης</dt><dd>{packet.targetPlanHash}</dd>
   </dl>
   <p>{packet.installed?'Το νέο σχέδιο είναι ήδη εγκατεστημένο.':'Ο έλεγχος ολοκληρώθηκε. Η προετοιμασία αφορά την κοινή βάση και ενημερώνει την προστασία όλων των ήδη εγγεγραμμένων καταστημάτων, διατηρώντας τις γενιές τους.'}</p>
   <label><input type="checkbox" checked={ack} disabled={busy} onChange={event=>setAck(event.target.checked)}/>Εγκρίνω την εγκατάσταση για την εταιρεία και το κατάστημα που εμφανίζονται.</label>
   <button type="button" disabled={busy||!ack} onClick={()=>run(true)}>Εγκατάσταση προετοιμασίας αναφορών</button>
  </>}
 </section>;
}
