import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createExpectedReceiptInstallationSession,sameExpectedReceiptCredential} from './expected-receipt-installation-context.mjs';
const samePacketContext=(a,b)=>!!a&&!!b&&['actorId','companyId','storeId','sourceRevision','oldPlanHash','targetPlanHash','targetProfile','schema'].every(k=>a[k]===b[k]);
const sameEnrollment=(a,b)=>JSON.stringify(a?.enrollments)===JSON.stringify(b?.enrollments);
const storageKey=packet=>`mws:no14-install:${packet.actorId}:${packet.companyId}:${packet.storeId}`;
export default function ExpectedReceiptInstallationPanel({api,storeId,onInstalled}){
 const session=useMemo(()=>createExpectedReceiptInstallationSession({storage:window.localStorage,sessions:window.sessionStorage}),[]);
 const generation=useRef(0),inspectionContext=useRef(null);
 const [inspection,setInspection]=useState(null),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[admitted,setAdmitted]=useState(false);
 const path=`/api/platform/expected-receipt-installation/stores/${encodeURIComponent(storeId)}`;
 const checked=(value,bound)=>{const packet=value?.packet;if(typeof value?.eligible!=='boolean'||!packet||typeof packet.installed!=='boolean'||!['actorId','companyId','storeId','sourceRevision','oldPlanHash','targetPlanHash','targetProfile','schema'].every(key=>typeof packet[key]==='string'&&packet[key].trim())||!Array.isArray(packet.enrollments)||packet.storeId!==storeId||packet.actorId!==bound.credentialIdentity.actorId)throw Error('Μη έγκυρη απάντηση ελέγχου εγκατάστασης.');return value;};
 const readSaved=packet=>{const raw=window.sessionStorage.getItem(storageKey(packet));if(!raw)return null;const saved=JSON.parse(raw),original=saved?.version===2?saved.packet:saved;if(original?.actorId!==packet.actorId||original.companyId!==packet.companyId||original.storeId!==packet.storeId)throw Error('Το αποθηκευμένο αίτημα χρειάζεται ανασκόπηση.');return {version:saved?.version===2?2:1,packet:original,credentialIdentity:saved?.version===2?saved.credentialIdentity:null};};
 const bindInspection=async()=>{const bound=session.context(),request=session.bind(api,path,bound);const result=checked(await request(path+'/inspect'),bound);return {bound,request,result};};
 useEffect(()=>{
  const token=++generation.current;inspectionContext.current=null;setInspection(null);setPending(null);setError('');setConfirmed(false);setBusy(false);setAdmitted(false);
  let initialBound;try{initialBound=session.context();}catch{}
  bindInspection().then(({bound,result})=>{
   if(token!==generation.current)return;inspectionContext.current=bound;setInspection(result);setAdmitted(true);
   try{setPending(readSaved(result.packet));}
   catch(e){setError(e.message);setPending({version:1,packet:null,credentialIdentity:null});}
  }).catch(reason=>{if(token!==generation.current||!initialBound)return;try{session.assertCurrent(initialBound);setAdmitted(true);setError(reason?.message||'Ο κεντρικός προέλεγχος δεν επιβεβαιώθηκε. Επιτρέπεται μόνο επανέλεγχος.');}catch{}});
  const unwatch=session.watch(()=>{generation.current++;inspectionContext.current=null;setInspection(null);setConfirmed(false);setBusy(false);setError('Η κεντρική συνεδρία άλλαξε. Επανέλεγξε την εγκατάσταση· το αρχικό αίτημα διατηρείται.');},window,document);
  return()=>{generation.current++;unwatch();};
 },[api,storeId,session]);
 const refresh=async()=>{
  setBusy(true);setError('');setConfirmed(false);const token=generation.current;
  try{
   const {bound,result}=await bindInspection();if(token!==generation.current)return;
   inspectionContext.current=bound;setInspection(result);setAdmitted(true);
   const saved=pending||readSaved(result.packet);setPending(saved);
   if(saved&&(saved.version!==2||sameExpectedReceiptCredential(bound.credentialIdentity,saved.credentialIdentity))&&result.packet.installed&&samePacketContext(result.packet,saved.packet)&&sameEnrollment(result.packet,saved.packet)){
    window.sessionStorage.removeItem(storageKey(saved.packet));setPending(null);onInstalled?.();
   }else if(saved&&(!samePacketContext(result.packet,saved.packet)||!sameExpectedReceiptCredential(bound.credentialIdentity,saved.credentialIdentity)))setError('Το αρχικό αίτημα ανήκει σε διαφορετικό πλαίσιο ή παλιά μορφή. Διατηρείται για ανασκόπηση και δεν υποβάλλεται με νέα ταυτότητα.');
  }catch(e){if(token===generation.current){inspectionContext.current=null;setInspection(null);setError(e.message);}}
  finally{if(token===generation.current)setBusy(false);}
 };
 const retryAllowed=!!inspection&&!!inspectionContext.current&&(!pending||(pending.version===2&&samePacketContext(inspection.packet,pending.packet)&&sameEnrollment(inspection.packet,pending.packet)&&sameExpectedReceiptCredential(inspectionContext.current.credentialIdentity,pending.credentialIdentity)));
 const apply=async()=>{
  if(!inspection||!retryAllowed)return;
  if(!inspection.eligible){setError('Η εγκατάσταση δεν είναι ενεργοποιημένη στην υπηρεσία. Επιτρέπεται μόνο επανέλεγχος.');return;}
  const bound=inspectionContext.current,packet=pending?.packet||inspection.packet;
  setBusy(true);setError('');const token=generation.current;
  try{
   session.assertCurrent(bound);
   const request=session.bind(api,path,bound),intent=pending||{version:2,packet,credentialIdentity:bound.credentialIdentity};
   window.sessionStorage.setItem(storageKey(packet),JSON.stringify(intent));setPending(intent);
   const result=await request(path+'/install',{method:'POST',body:JSON.stringify({packet,explicitAuthorization:true})});
   if(token!==generation.current)return;if(result?.installed!==true)throw Error('Το αποτέλεσμα δεν επιβεβαιώθηκε.');
   const next=checked(await request(path+'/inspect'),bound);if(token!==generation.current)return;
   if(!samePacketContext(next.packet,packet)||!sameEnrollment(next.packet,packet)||!next.packet.installed)throw Error('Η ταυτότητα ή η τελική εγκατάσταση χρειάζεται ανασκόπηση.');
   inspectionContext.current=bound;setInspection(next);window.sessionStorage.removeItem(storageKey(packet));setPending(null);onInstalled?.();
  }catch(e){if(token===generation.current)setError(e.message||'Το αποτέλεσμα χρειάζεται επανέλεγχο με το ίδιο αίτημα.');}
  finally{if(token===generation.current)setBusy(false);}
 };
 if(!admitted)return null;
 return <section aria-label="Εγκατάσταση αναμενόμενων παραλαβών"><h4>Προετοιμασία κοινής υπηρεσίας</h4>{!inspection&&<p role="status">Δεν επιβεβαιώθηκε ο εξουσιοδοτημένος προέλεγχος από την υπηρεσία. Δεν διατίθεται ενέργεια εγκατάστασης.</p>}<p>Η εγκατάσταση αφορά το κοινό schema της υπηρεσίας και τα υφιστάμενα lifecycle fences όλων των καταστημάτων. Προσθέτει τρεις πίνακες χωρίς αλλαγή χρημάτων, αποθέματος ή εμπορικών εγγραφών. Η άσκηση backup/restore παραμένει χωριστή εκκρεμότητα.</p>{inspection?.eligible===false&&!inspection.packet.installed&&<p role="status">Η δυνατότητα εγκατάστασης είναι απενεργοποιημένη στην υπηρεσία. Διατίθεται μόνο επανέλεγχος.</p>}{error&&<p role="alert">{error}</p>}{pending&&<p role="status">Υπάρχει αποθηκευμένο αίτημα με αβέβαιο αποτέλεσμα. Επανέλεγξε ή επανάλαβε αποκλειστικά το ίδιο αίτημα.</p>}<button disabled={busy} onClick={refresh}>Επανέλεγχος εγκατάστασης</button>{inspection&&!inspection.packet.installed&&<label><input type="checkbox" checked={confirmed} disabled={busy||!!pending} onChange={e=>setConfirmed(e.target.checked)}/>Κατανοώ ότι αφορά την κοινή υπηρεσία</label>}{inspection&&(!inspection.packet.installed||pending)&&<button disabled={busy||!inspection.eligible||(!pending&&!confirmed)||!retryAllowed} onClick={apply}>{pending?'Επανάληψη ίδιου αιτήματος':'Ρητή εγκατάσταση αναμενόμενων παραλαβών'}</button>}{inspection?.packet.installed&&!pending&&<p>Το τρέχον target επαληθεύτηκε.</p>}</section>;
}
