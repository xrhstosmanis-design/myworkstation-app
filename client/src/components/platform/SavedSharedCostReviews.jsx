import React,{useEffect,useRef,useState} from 'react';
const base='/api/ai-wallet/platform/shared-cost-reviews';
const euros=cents=>(Number(cents)/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export default function SavedSharedCostReviews({api,mode,period,input,result,decisions,onLock}){
 const [reference,setReference]=useState(''),[quote,setQuote]=useState(null),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(null),[history,setHistory]=useState(null);
 const epoch=useRef(0),inFlight=useRef(false),alive=useRef(true);
 const binding=JSON.stringify({mode,period,input,result,reference}),decisionKey=JSON.stringify(decisions||{});
 useEffect(()=>{epoch.current++;setQuote(null);setConfirmed(false);setSaved(null);setHistory(null)},[binding]);
 useEffect(()=>{setConfirmed(false)},[decisionKey]);
 useEffect(()=>{onLock(Boolean(pending));return()=>onLock(false)},[pending,onLock]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[]);
 const verify=async()=>{
  if(inFlight.current||!result||!api)return;inFlight.current=true;setBusy(true);setError('');const generation=epoch.current;
  try{const value=await api(base+'/preview',{method:'POST',body:JSON.stringify({mode,period,proposalReference:reference.trim(),input})});
   if(generation!==epoch.current||!alive.current)return;
   if(JSON.stringify(value.result)!==JSON.stringify(result))throw Error('Ο κατάλογος ή τα ποσά διαφέρουν. Υπολόγισε ξανά πριν από την έγκριση.');
   setQuote(value);setConfirmed(false);
  }catch(e){if(generation===epoch.current&&alive.current)setError(e.message)}finally{inFlight.current=false;if(alive.current)setBusy(false)}
 };
 const save=async()=>{
  if(inFlight.current||!api||(!pending&&(!confirmed||!quote)))return;
  const payload=pending?.payload||{mode,period,proposalReference:reference.trim(),input:quote.input,expectedVersion:quote.expectedVersion,quoteHash:quote.quoteHash,requestId:crypto.randomUUID(),decisions:decisions||{},reviewConfirmed:true};
  const expectedProposalId=pending?.proposalId||quote.proposalId;
  setPending({payload,proposalId:expectedProposalId});inFlight.current=true;setBusy(true);setError('');
  try{const value=await api(base+'/save',{method:'POST',body:JSON.stringify(payload)});
   if(!alive.current)return;
   if(value.posted!==false||value.proposalId!==expectedProposalId)throw Error('Δεν επιβεβαιώθηκε η αναμενόμενη αποθήκευση.');
   setSaved(value);setPending(null);setQuote(null);setConfirmed(false);setHistory(null);
  }catch(e){if(alive.current)setError(e.message+' Το αποτέλεσμα παραμένει αβέβαιο. Η επανάληψη χρησιμοποιεί ακριβώς το ίδιο αίτημα, χωρίς δεύτερη καταχώριση.')}finally{inFlight.current=false;if(alive.current)setBusy(false)}
 };
 const loadHistory=async()=>{
  if(inFlight.current||!api)return;inFlight.current=true;setBusy(true);setError('');const generation=epoch.current;
  try{const query=new URLSearchParams({mode,period,proposalReference:reference.trim()});const value=await api(base+'/history?'+query,{cache:'no-store'});if(generation===epoch.current&&alive.current)setHistory(value)}catch(e){if(generation===epoch.current&&alive.current)setError(e.message)}finally{inFlight.current=false;if(alive.current)setBusy(false)}
 };
 const record=value=><article key={value.id}><h4>Έκδοση {value.version} · {value.mode==='SYNTHETIC'?'ΣΥΝΘΕΤΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ':'Εμπορικός έλεγχος'}</h4><p>{value.proposalReference} · {value.period} · {value.actorName} · {new Date(value.savedAt).toLocaleString('el-GR')}</p><p>Πηγή: {value.result.reference}. Αρχικό {euros(value.result.baseCents)} · Σύνολο {euros(value.result.totalCents)}</p><ul>{value.review.rows.map(r=><li key={r.companyId}>{r.companyName}: {euros(r.amountCents)} · {r.decision==='APPROVED_DRAFT'?'Εγκεκριμένο προσχέδιο':r.decision==='WAIVED'?'Να μη χρεωθεί':'Σε αναμονή'}</li>)}</ul><p>Αποθηκευμένος έλεγχος. Δεν έχει καταχωριστεί χρέωση ή οφειλή.</p></article>;
 return <section aria-label="Αποθήκευση ελέγχου κοινών εξόδων">
  <h3>Αποθήκευση απόφασης και ιστορικό</h3>
  <p>Οι επιλογές μένουν προσωρινές μέχρι να επιβεβαιωθεί η αποθήκευση. Ο έλεγχος αποθηκεύεται χωριστά από χρέωση, πίστωση και email.</p>
  <label>Μοναδική αναφορά επιμερισμού <input value={reference} minLength={5} maxLength={160} disabled={busy||Boolean(pending)} onChange={e=>setReference(e.target.value)}/></label>
  <p>Για να ξαναδείς έναν έλεγχο, επίλεξε τον ίδιο μήνα, το ίδιο πραγματικό ή ενδεικτικό περιβάλλον και γράψε την ίδια αναφορά. Οι τελευταίες 20 εκδόσεις εμφανίζονται χωριστά.</p>
  <button type="button" disabled={!api||busy||reference.trim().length<5||!period} onClick={loadHistory}>Ανάγνωση αποθηκευμένων ελέγχων</button>
  <button type="button" disabled={!api||busy||Boolean(pending)||!result||reference.trim().length<5} onClick={verify}>Έλεγχος στον server</button>
  {quote&&<><p>Επιβεβαιωμένο σύνολο {euros(quote.result.totalCents)} · επόμενη έκδοση {quote.expectedVersion+1} · {mode==='SYNTHETIC'?'Μόνο συνθετικό δοκιμαστικό':'Εμπορικός έλεγχος'}.</p><label><input type="checkbox" disabled={busy||Boolean(pending)} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Επιβεβαιώνω τα συγκεκριμένα ποσά και τις αποφάσεις ανά εταιρεία για αποθήκευση ελέγχου.</label></>}
  <button type="button" disabled={busy||!api||(!pending&&(!quote||!confirmed))} onClick={save}>{pending?'Επανάληψη ίδιου αιτήματος αποθήκευσης':'Αποθήκευση αποφάσεων'}</button>
  {pending&&<p role="status">Αναφορά αιτήματος: {pending.payload.requestId}. Κράτησε αυτή την οθόνη μέχρι να επιβεβαιωθεί το αποτέλεσμα. Αν κλείσει, διάβασε πρώτα το ιστορικό της ίδιας αναφοράς πριν από νέα απόφαση.</p>}
  {error&&<p role="alert">{error}</p>}{saved&&<div role="status">Αποθηκεύτηκε η απόφαση.{record(saved)}</div>}
  {history&&<section aria-label="Αποθηκευμένοι έλεγχοι">{history.records.length?history.records.map(record):<p>Δεν βρέθηκε αποθηκευμένος έλεγχος για αυτή την αναφορά.</p>}</section>}
 </section>;
}
