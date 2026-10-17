import React,{useEffect,useMemo,useRef,useState} from "react";
import {BrainCircuit,Plus,X,Send,FileDown,MessageSquare,Menu,Copy,Check,Square} from "lucide-react";
import VoiceInputControls from "./VoiceInputControls.jsx";
import AssistantReportEvidence from "./AssistantReportEvidence.jsx";
import {presentAssistantAnswer} from "./presentAssistantAnswer.js";
import {watchPlatformAssistantContext} from "../platform/platform-assistant-context.mjs";
import {readBackofficeContext} from "../../utils/backofficeSessionBoundary.mjs";
import {assistantRequestedFile,downloadAssistantFile} from "./assistant-file-download.js";
import "./assistant-chat.css";
const names={business_records:"Μεταφορές · Πληρωμές · Έξοδα · Παραστατικά · Προσωπικό",cash_details:"Ταμεία",sales_by_product:"Πωλήσεις ειδών",sales_by_store:"Πωλήσεις ανά κατάστημα",stock_by_product:"Απόθεμα",consumption_details:"Ιδιοκατανάλωση / Καταστροφή"};
const key=p=>p?.companyId&&p?.storeId?JSON.stringify([p.companyId,p.storeId]):"";
const uuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const newThread=()=>({id:uuid(),title:"Νέα συνομιλία",messages:[]});
function validEvidence(result,pair,all,platform){
 if(pair&&(result.scope?.companyId!==pair.companyId||result.scope?.storeId!==pair.storeId))return false;
 if(!pair&&!all)return false;
 return (result.evidence||[]).every(r=>{
  if(r.kind==="sales_by_store")return r.scope===(all?(platform?"PLATFORM_AUTHORIZED_STORES":"OWNER_OWN_STORES"):(platform?"PLATFORM_SELECTED_STORE":"OWNER_SELECTED_STORE"))&&(all||(r.stores||[]).every(s=>s.companyId===pair.companyId&&s.storeId===pair.storeId));
  if(platform&&all&&!r.kind&&r.scope==="PLATFORM_ALL_STORES")return true;
  return Boolean(pair)&&r.scope===(platform?"PLATFORM_SELECTED_STORE":"OWNER_SELECTED_STORE")&&r.companyId===pair.companyId&&r.storeId===pair.storeId;
 });
}
export default function AssistantChatPage({open,mode="platform",api,companies=[],initialSelection=null,initialAllScope=false,onSelectionChange,onAllScopeChange,onClose,ownerStoreId="",ownerStoreName="",ownerAccess=null,contextEpoch=0,download=downloadAssistantFile}){
 const platform=mode==="platform",stores=useMemo(()=>companies.filter(c=>c.active).flatMap(c=>(c.stores||[]).filter(s=>s.active!==false).map(s=>({companyId:c.id,companyName:c.name,storeId:s.id,storeName:s.name}))),[companies]);
 const [selected,setSelected]=useState(()=>key(initialSelection)),[all,setAll]=useState(Boolean(initialAllScope)),[threads,setThreads]=useState(()=>[newThread()]),[threadId,setThreadId]=useState(""),[question,setQuestion]=useState(""),[busy,setBusy]=useState(false),[voice,setVoice]=useState(false),[channel,setChannel]=useState("text"),[access,setAccess]=useState(null),[error,setError]=useState(""),[files,setFiles]=useState([]),[sessionEpoch,setSessionEpoch]=useState(0),[sidebarOpen,setSidebarOpen]=useState(false),[copied,setCopied]=useState(""),[copyNotice,setCopyNotice]=useState("");
 const pair=platform?stores.find(s=>key(s)===selected)||null:ownerAccess?.scope?{...ownerAccess.scope,storeId:ownerStoreId,storeName:ownerStoreName||ownerAccess.scope.storeName}:null;
 const binding=JSON.stringify([mode,key(pair),all,sessionEpoch,contextEpoch,platform?null:ownerAccess?.supported||null,ownerAccess?.scope?.supportPreview||false]);
 const live=useRef(binding),generation=useRef(0),pending=useRef(null),statusPending=useRef(null),end=useRef(null),dialog=useRef(null),closeRef=useRef(onClose),sidebar=useRef(null),menuButton=useRef(null),input=useRef(null);closeRef.current=onClose;live.current=binding;
 const active=threads.find(t=>t.id===threadId)||threads[0];
 const activeThread=useRef(active?.id);activeThread.current=active?.id;
 const abort=()=>{generation.current++;pending.current?.abort();pending.current=null;setBusy(false);setVoice(false)};
 const clear=()=>{setSidebarOpen(false);setCopied("");setCopyNotice("");abort();const t=newThread();setThreads([t]);setThreadId(t.id);setQuestion("");setFiles([]);setAccess(null)};
 useEffect(()=>{if(platform)setSelected(key(initialSelection));},[platform,initialSelection?.companyId,initialSelection?.storeId]);
 useEffect(()=>{setAll(Boolean(initialAllScope));},[initialAllScope]);
 useEffect(()=>{clear();setError("");return()=>{pending.current?.abort();statusPending.current?.abort()}},[binding]);
 useEffect(()=>{
  if(platform)return watchPlatformAssistantContext(window.localStorage,window.sessionStorage,window,document,()=>{clear();setSessionEpoch(e=>e+1)});
  let previous=readBackofficeContext(window.localStorage).key;const check=()=>{const next=readBackofficeContext(window.localStorage).key;if(next!==previous){previous=next;clear();setSessionEpoch(e=>e+1)}};
  window.addEventListener("storage",check);window.addEventListener("focus",check);const timer=window.setInterval(check,800);return()=>{window.clearInterval(timer);window.removeEventListener("storage",check);window.removeEventListener("focus",check)};
 },[platform]);
 useEffect(()=>{
  if(!open){abort();statusPending.current?.abort();return}
  let closed=false,checking=false,lastSupported=null;const captured=binding;
  const check=async()=>{if(closed||checking)return;checking=true;const controller=new AbortController();statusPending.current=controller;
   try{
    if(!pair&&!all){setAccess(null);return}
    const params=new URLSearchParams({readScope:all?"all_stores":"selected_store"});if(pair){params.set("companyId",pair.companyId);params.set("storeId",pair.storeId)}
    const path=platform?`/api/platform/ai-command-center/status?${params}`:`/api/owner-assistant/stores/${encodeURIComponent(ownerStoreId)}/status${all?"?readScope=own_stores":""}`;
    const next=await api(path,{signal:controller.signal,cache:"no-store"});if(closed||live.current!==captured||controller.signal.aborted)return;
    if(!next.available||pair&&(next.scope?.companyId!==pair.companyId||next.scope?.storeId!==pair.storeId)){clear();setError("Δεν υπάρχει διαθέσιμη εξουσιοδοτημένη αναφορά στο επιλεγμένο κατάστημα.");return}
    const capabilities=JSON.stringify([next.supported,next.salesScopeKey||null]);if(lastSupported!==null&&capabilities!==lastSupported){clear();setError("Οι διαθέσιμες αναφορές άλλαξαν. Ξεκίνα νέα ερώτηση.")}
    lastSupported=capabilities;setAccess(next);
   }catch(e){if(!closed&&live.current===captured&&!controller.signal.aborted){clear();setError(e.message||"Δεν επιβεβαιώθηκε η πρόσβαση του βοηθού.")}}
   finally{checking=false}
  };
  check();const timer=window.setInterval(check,8000);window.addEventListener("focus",check);return()=>{closed=true;window.clearInterval(timer);window.removeEventListener("focus",check);statusPending.current?.abort()};
 },[open,binding,api]);
 useEffect(()=>{if(!open)return;const previous=document.activeElement;dialog.current?.querySelector(".mws-chat-header button[aria-label=\"Νέα συνομιλία\"]")?.focus();return()=>{if(previous?.isConnected)previous.focus()}},[open]);
 useEffect(()=>{if(!open)return;const root=dialog.current;const handle=event=>{if(event.key==="Escape"){event.preventDefault();if(sidebarOpen){setSidebarOpen(false);menuButton.current?.focus()}else closeRef.current?.();return}if(event.key!=="Tab")return;const focusRoot=sidebarOpen?sidebar.current:root;const items=[...focusRoot.querySelectorAll("button:not([disabled]),select:not([disabled]),textarea:not([disabled]),input:not([disabled])")].filter(el=>el.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&(document.activeElement===first||!focusRoot.contains(document.activeElement))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||!focusRoot.contains(document.activeElement))){event.preventDefault();first.focus()}};document.addEventListener("keydown",handle);return()=>document.removeEventListener("keydown",handle)},[open,sidebarOpen]);
 useEffect(()=>{if(sidebarOpen)sidebar.current?.querySelector("button")?.focus()},[sidebarOpen]);
 useEffect(()=>{if(open)input.current?.focus()},[active?.id]);
 useEffect(()=>{const media=window.matchMedia?.("(max-width: 760px)");if(!media)return;const changed=()=>{if(!media.matches)setSidebarOpen(false)};media.addEventListener?.("change",changed);return()=>media.removeEventListener?.("change",changed)},[]);
 useEffect(()=>{if(input.current){input.current.style.height="auto";input.current.style.height=`${Math.min(180,Math.max(64,input.current.scrollHeight))}px`}},[question,open]);
 useEffect(()=>{end.current?.scrollIntoView?.({block:"nearest"})},[threads,busy]);
 const append=(id,message)=>setThreads(old=>old.map(t=>t.id===id?{...t,title:t.messages.length?t.title:message.content.slice(0,55),messages:[...t.messages,message].slice(-40)}:t));
 const exportFile=async(format,result,controller,captured,id)=>{
  if(!platform||!result.exportTicket)throw new Error("Ζήτησε ξανά την αναφορά πριν δημιουργήσεις αρχείο.");
  const file=await api("/api/platform/ai-command-center/export",{method:"POST",signal:controller.signal,body:JSON.stringify({ticket:result.exportTicket,format})});
  if(live.current!==captured||id!==generation.current||controller.signal.aborted)return;
  download(file);setFiles(old=>[...old,{name:file.filename,time:file.generatedAt}].slice(-8));
 };
 const ask=async event=>{
  event.preventDefault();const text=question.trim();if(!text||busy||voice||!access||!active)return;
  const captured=binding,id=++generation.current,controller=new AbortController(),target=active.id;pending.current=controller;setBusy(true);setError("");
  const history=active.messages.filter(m=>["user","assistant"].includes(m.role)).slice(-10).map(m=>({role:m.role,content:m.content.slice(0,2000)}));
  append(target,{id:uuid(),role:"user",content:text,time:new Date().toISOString()});setQuestion("");
  try{
   const body={question:text,inputChannel:channel,history,readScope:all?(platform?"all_stores":"own_stores"):"selected_store",...(platform?{selection:pair?{companyId:pair.companyId,storeId:pair.storeId}:null,snapshot:null}:{})};
   const result=await api(platform?"/api/platform/ai-command-center/ask":`/api/owner-assistant/stores/${encodeURIComponent(ownerStoreId)}/ask`,{method:"POST",signal:controller.signal,body:JSON.stringify(body)});
   if(live.current!==captured||id!==generation.current||controller.signal.aborted)return;
   if(!validEvidence(result,pair,all,platform))throw new Error("Το εύρος της απάντησης άλλαξε. Ζήτησε νέα αναφορά.");
   const presented=presentAssistantAnswer(result);append(target,{id:uuid(),role:"assistant",content:presented.answer,time:result.generatedAt||new Date().toISOString(),result});
   const format=assistantRequestedFile(text);if(format&&platform&&result.exportTicket)await exportFile(format,result,controller,captured,id);
  }catch(e){if(live.current===captured&&id===generation.current&&!controller.signal.aborted){setError(e.message||"Η αναζήτηση δεν ολοκληρώθηκε.");append(target,{id:uuid(),role:"error",content:e.message||"Η αναζήτηση δεν ολοκληρώθηκε.",time:new Date().toISOString()})}}
  finally{if(live.current===captured&&id===generation.current){setBusy(false);pending.current=null;setChannel("text")}}
 };
 const manualExport=async(format,result)=>{if(busy)return;const id=++generation.current,captured=binding,controller=new AbortController();pending.current=controller;setBusy(true);setError("");try{await exportFile(format,result,controller,captured,id)}catch(e){if(live.current===captured&&id===generation.current&&!controller.signal.aborted)setError(e.message)}finally{if(live.current===captured&&id===generation.current){setBusy(false);pending.current=null}}};
 const createThread=()=>{setSidebarOpen(false);setCopied("");setCopyNotice("");abort();const t=newThread();setThreads(old=>[t,...old].slice(0,8));setThreadId(t.id);setQuestion("");setError("")};
 const copyAnswer=async message=>{
  const captured=binding,target=active?.id;
  try{
   if(!navigator.clipboard?.writeText)throw new Error();
   const presented=message.result?presentAssistantAnswer(message.result):null;
   await navigator.clipboard.writeText([message.content,...(presented?.highlights||[]),presented?.limitations].filter(Boolean).join("\n"));
   if(live.current===captured&&target===activeThread.current){setCopied(message.id);setCopyNotice("Το κείμενο αντιγράφηκε.")}
  }catch{if(live.current===captured&&target===activeThread.current)setCopyNotice("Η αντιγραφή δεν είναι διαθέσιμη. Επίλεξε και αντέγραψε το κείμενο της απάντησης.")}
 };
 const cancelRequest=()=>{abort();setError("Η αναζήτηση διακόπηκε. Μπορείς να στείλεις νέα ερώτηση.");setChannel("text")};
 const composerKeyDown=event=>{
  if(event.key!=="Enter"||event.shiftKey||event.nativeEvent?.isComposing||event.isComposing||event.keyCode===229)return;
  if(window.matchMedia?.("(max-width: 760px)").matches)return;
  event.preventDefault();if(question.trim().length>=3&&!busy&&!voice&&access)event.currentTarget.form?.requestSubmit();
 };
 if(!open)return null;
 return <div ref={dialog} className="mws-assistant-page" role="dialog" aria-modal="true" aria-label="Σελίδα συνομιλίας MyWorkStation">
  {sidebarOpen&&<button type="button" className="mws-chat-backdrop" tabIndex={-1} aria-label="Κλείσιμο λίστας συζητήσεων" onClick={()=>{setSidebarOpen(false);menuButton.current?.focus()}}/>}
  <aside ref={sidebar} id="mws-chat-conversations" className={`mws-chat-sidebar ${sidebarOpen?"is-open":""}`} aria-label="Συζητήσεις"><button type="button" className="mws-chat-drawer-close" onClick={()=>{setSidebarOpen(false);menuButton.current?.focus()}} aria-label="Κλείσιμο συζητήσεων"><X/>Κλείσιμο</button><div className="mws-chat-brand"><BrainCircuit/><div><b>MyWorkStation</b><span>Βοηθός</span></div></div><button type="button" className="mws-chat-new" onClick={createThread}><Plus/>Νέα συνομιλία</button><small>Συζητήσεις αυτής της συνεδρίας</small><nav>{threads.map(t=><button type="button" key={t.id} className={active?.id===t.id?"active":""} aria-current={active?.id===t.id?"page":undefined} onClick={()=>{abort();setSidebarOpen(false);setCopied("");setCopyNotice("");setThreadId(t.id);setQuestion("");setError("")}}><MessageSquare/>{t.title}</button>)}</nav><p>Οι αναφορές ακολουθούν το επιλεγμένο κατάστημα και τα δικαιώματά σου.</p><button type="button" onClick={onClose}><X/>Επιστροφή στο πρόγραμμα</button></aside>
  <main className="mws-chat-main"><header className="mws-chat-header"><button ref={menuButton} type="button" className="mws-chat-menu" aria-label="Συζητήσεις" aria-expanded={sidebarOpen} aria-controls="mws-chat-conversations" onClick={()=>setSidebarOpen(v=>!v)}><Menu/></button><div><h1>Βοηθός MyWorkStation</h1><p>{platform?"Super Admin":"Ιδιοκτήτης"} · μόνο ανάγνωση</p></div><button type="button" onClick={createThread} aria-label="Νέα συνομιλία"><Plus/></button><button type="button" onClick={onClose} aria-label="Κλείσιμο συνομιλίας"><X/></button></header>
   <div className="mws-chat-scope">{platform?<label>Περιοχή καταστημάτων<select aria-label="Κατάστημα συνομιλίας" value={pair?key(pair):""} onChange={e=>{const selected=stores.find(s=>key(s)===e.target.value);setSelected(e.target.value);onSelectionChange?.(selected?{companyId:selected.companyId,storeId:selected.storeId}:{companyId:"",storeId:""})}}><option value="">Επίλεξε κατάστημα…</option>{stores.map(s=><option key={key(s)} value={key(s)}>{s.companyName} · {s.storeName}</option>)}</select></label>:<strong>{pair?.companyName} · {ownerStoreName||pair?.storeName}</strong>}<label className="mws-chat-all"><input type="checkbox" checked={all} disabled={Boolean(ownerAccess?.scope?.supportPreview)} onChange={e=>{setAll(e.target.checked);onAllScopeChange?.(e.target.checked)}}/>{platform?"Πωλήσεις και ταμεία από όλα τα καταστήματα":"Πωλήσεις από όλα τα δικά μου επιτρεπόμενα καταστήματα"}</label></div>
   <div className="mws-chat-messages" aria-live="polite">{!active?.messages.length&&<div className="mws-chat-welcome"><BrainCircuit/><h2>Τι θέλεις να αναζητήσουμε;</h2><p>Ρώτησε με φυσική γλώσσα και συνέχισε με «και χθες;» ή «χώρισέ τα ανά κατάστημα».</p><div className="mws-chat-capabilities">{(access?.supported||[]).filter((n,i,a)=>a.indexOf(n)===i).map(n=>names[n]&&<span key={n}>{names[n]}</span>)}</div><button type="button" onClick={()=>setQuestion("Βγάλε μου λίστα ιδιοκατανάλωσης από 1/10/2026 έως 12/10/2026")}>Λίστα ιδιοκατανάλωσης</button><button type="button" onClick={()=>setQuestion("Πόσες πωλήσεις είχαμε σε νερά σήμερα;")}>Πωλήσεις με ονομασία</button>{platform&&<p>Για αρχείο ζήτησε Excel, PDF, CSV ή Word μαζί με την αναφορά.</p>}</div>}
    {(active?.messages||[]).map(m=><article key={m.id} className={`mws-chat-message ${m.role}`} aria-label={m.role==="user"?"Ερώτησή μου":m.role==="error"?"Αποτυχία αναζήτησης":"Απάντηση βοηθού"}><small>{m.role==="user"?"Εσύ":m.role==="error"?"Η αναζήτηση δεν ολοκληρώθηκε":"MyWorkStation"} · {new Date(m.time).toLocaleTimeString("el-GR",{timeZone:"Europe/Athens",hour12:false,hour:"2-digit",minute:"2-digit"})}</small><p style={{whiteSpace:"pre-wrap"}}>{m.content}</p>{m.role==="assistant"&&<button type="button" className="mws-chat-copy" aria-label="Αντιγραφή κειμένου απάντησης" onClick={()=>copyAnswer(m)}>{copied===m.id?<Check/>:<Copy/>}{copied===m.id?"Αντιγράφηκε":"Αντιγραφή"}</button>}{m.result&&<>{presentAssistantAnswer(m.result)?.highlights?.length>0&&<ul>{presentAssistantAnswer(m.result).highlights.map((h,i)=><li key={i}>{h}</li>)}</ul>}<p className="mws-chat-limit">{presentAssistantAnswer(m.result)?.limitations}</p><AssistantReportEvidence result={m.result}/>{platform&&m.result.exportTicket&&<div className="mws-chat-exports"><span><FileDown/>Αρχεία αναφοράς</span>{[["xlsx","Excel"],["pdf","PDF"],["csv","CSV"],["docx","Word"]].map(([format,label])=><button type="button" key={format} disabled={busy||!access} onClick={()=>manualExport(format,m.result)}>{label}</button>)}</div>}</>}</article>)}
    {busy&&<p className="mws-chat-working" role="status">Αναζήτηση στις αναφορές / προετοιμασία αρχείου…</p>}<div ref={end}/></div>
   <footer className="mws-chat-composer">{copyNotice&&<p className="mws-chat-copy-notice" role="status">{copyNotice}</p>}{error&&<p role="alert">{error}</p>}{files.length>0&&<div className="mws-chat-files" role="status">{files.map((f,i)=><span key={i}><FileDown/>{f.name}</span>)}</div>}<form onSubmit={ask}><label className="mws-chat-input-label">Μήνυμα στον βοηθό<textarea ref={input} onKeyDown={composerKeyDown} aria-describedby="mws-chat-keyboard-hint" aria-label="Μήνυμα στον βοηθό" value={question} maxLength={600} disabled={busy||voice||!access} onChange={e=>{setQuestion(e.target.value);setChannel("text")}} placeholder={access?"Γράψε την ερώτησή σου…":"Επίλεξε εξουσιοδοτημένο κατάστημα για να ξεκινήσεις…"}/></label>{busy?<button type="button" className="mws-chat-send mws-chat-stop" onClick={cancelRequest}><Square/>Διακοπή</button>:<button type="submit" className="mws-chat-send" disabled={voice||!access||question.trim().length<3}><Send/>Αποστολή</button>}</form><div className="mws-chat-composer-meta"><span id="mws-chat-keyboard-hint">Enter για αποστολή · Shift+Enter για νέα γραμμή</span><span>{question.length}/600</span></div><VoiceInputControls key={`${binding}:${active?.id}`} value={question} onChange={v=>{setQuestion(v);setChannel("voice")}} onActiveChange={setVoice} disabled={busy||!access} contextKey={`${binding}:${active?.id}`}/><small>Τα ποσά προέρχονται από τις πραγματικές αναφορές. Ελέγχεις το κείμενο της φωνής πριν πατήσεις Αποστολή.</small></footer>
  </main>
 </div>;
}
