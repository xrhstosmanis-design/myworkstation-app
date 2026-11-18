import React,{useEffect,useRef,useState} from 'react';

const base='/api/platform/backoffice-company-installation';
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const valid=(p,profile)=>p?.profile===profile&&hex(p.sourceRevision,40)&&hex(p.oldPlanHash,64)&&hex(p.targetPlanHash,64)&&p.productionActivated===false;

export default function CompanyAuthorityInstallationManager({request}){
 const [profile,setProfile]=useState(''),[packet,setPacket]=useState(null),[receipt,setReceipt]=useState(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[enabled,setEnabled]=useState(false);
 const epoch=useRef(0),pending=useRef(false),fileVersion=useRef(0);
 useEffect(()=>{epoch.current++;fileVersion.current++;pending.current=false;setPacket(null);setReceipt(null);setAck(false);setBusy(false);setEnabled(false);setError('');setMessage('');return()=>{epoch.current++}},[profile,request]);
 async function run(install){
  if(pending.current||!profile||install&&(!enabled||!packet||!receipt||!ack))return;
  const generation=epoch.current,approved=packet,proof=receipt;pending.current=true;setBusy(true);setPacket(null);setAck(false);setError('');setMessage('');
  try{
   if(install){
    setReceipt(null);
    const result=await request(base+'/install',{method:'POST',body:JSON.stringify({profile,packet:approved,requestEnvelope:proof.requestEnvelope,proofEnvelope:proof.proofEnvelope,explicitAuthorization:true})});
    if(epoch.current!==generation)return;
    if(!valid(result,profile)||result.installed!==true)throw Error('Η εγκατάσταση δεν επιβεβαιώθηκε. Έλεγξε ξανά την κατάσταση.');
    setMessage('Επιβεβαιώθηκε η εγκατάσταση της υποδομής δικαιωμάτων. Η παραχώρηση δικαιωμάτων γίνεται χωριστά από τον ιδιοκτήτη.');
   }else{
    const description=await request(base+'/describe?profile='+profile);
    if(epoch.current!==generation)return;
    const result=await request(base+'/inspect',{method:'POST',body:JSON.stringify({profile})});
    if(epoch.current!==generation)return;
    if(!valid(result?.packet,profile)||!valid(description,profile)||['sourceRevision','oldPlanHash','targetPlanHash','targetRuntimeProfile'].some(k=>description[k]!==result.packet[k])||result.eligible!==true||result.pairedWorker!==true)throw Error('Δεν επιβεβαιώθηκε η ετοιμότητα εφαρμογής και υπηρεσίας αντιγράφων.');
    setEnabled(result.installationEnabled===true);setPacket(result.packet);
   }
  }catch(reason){if(epoch.current===generation)setError(reason?.message||'Η προετοιμασία δεν επιβεβαιώθηκε.')}
  finally{if(epoch.current===generation){pending.current=false;setBusy(false)}}
 }
 async function readReceipt(event){
  const generation=epoch.current,version=++fileVersion.current,file=event.target.files?.[0];setReceipt(null);setAck(false);setError('');
  try{
   if(!file||file.size>262144)throw Error('Επίλεξε το υπογεγραμμένο αρχείο ελέγχου αντιγράφου, έως256KB.');
   const value=JSON.parse(await file.text());
   if(epoch.current!==generation||fileVersion.current!==version)return;
   if(!value||Array.isArray(value)||Object.keys(value).length!==2||!value.requestEnvelope||!value.proofEnvelope)throw Error('Το αρχείο ελέγχου αντιγράφου δεν είναι έγκυρο.');
   setReceipt(value);
  }catch(reason){if(epoch.current===generation&&fileVersion.current===version)setError(reason.message)}
 }
 return <details><summary>Προετοιμασία εταιρικών δικαιωμάτων</summary><p>Η προετοιμασία αφορά την κοινή βάση όλων των εταιρειών. Δεν παραχωρεί δικαιώματα σε χρήστες.</p>
  <label>Προφίλ εταιρικής εγκατάστασης <select value={profile} disabled={busy} onChange={e=>setProfile(e.target.value)}><option value="">Επίλεξε προφίλ</option><option value="BASE">Βασικό</option><option value="CAPTURE">Μηνιαία καταγραφή</option><option value="CURRENT_CAPTURE">Τρέχουσα δομή με μηνιαία καταγραφή</option></select></label>
  {profile==='CURRENT_CAPTURE'&&<p>Εταιρικές αναγνώσεις. Η διαγραφή και η επαναφορά επιλεγμένου καταστήματος δεν διατίθενται από αυτό το προφίλ.</p>}
  <button type="button" disabled={!profile||busy} onClick={()=>run(false)}>Έλεγχος εταιρικής εγκατάστασης</button>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {packet&&!enabled&&<p>Η εγκατάσταση παραμένει απενεργοποιημένη στον διακομιστή.</p>}{packet&&<section aria-label="Επιβεβαιωμένη εταιρική προετοιμασία"><p>Έκδοση {packet.sourceRevision} · {packet.installed?'Ήδη εγκατεστημένο':'Έτοιμο για προετοιμασία'}</p><label>Υπογεγραμμένος έλεγχος πλήρους αντιγράφου και επαναφοράς <input key={profile} type="file" accept="application/json,.json" disabled={busy} onChange={readReceipt}/></label><label><input type="checkbox" checked={ack} disabled={busy||!receipt} onChange={e=>setAck(e.target.checked)}/>Εγκρίνω την εταιρική προετοιμασία στην κοινή βάση.</label><button type="button" disabled={busy||!enabled||!receipt||!ack} onClick={()=>run(true)}>Εγκατάσταση εταιρικής προετοιμασίας</button></section>}
 </details>;
}
