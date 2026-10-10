from pathlib import Path
root=Path('.')
def edit(name,fn):
 p=root/name;p.write_text(fn(p.read_text()))
def replace(s,old,new,count=1):
 assert s.count(old)==count,(old[:100],s.count(old),count)
 return s.replace(old,new)

def center(s):
 s=replace(s,'useEffect,useMemo,useState','useEffect,useMemo,useRef,useState')
 s=replace(s,'import AiCreditAlert','import {twinScopeKey} from "./ai-command-twin-navigation.js";\nimport AiCreditAlert')
 s=replace(s,'export default function AiCommandCenter({','export default function AiCommandCenter({onOpenTwinDestination,navigationBusy=false,navigationError="",')
 s=replace(s,'  const [problems,setProblems]','  const deviceLoadSequence=useRef(0);\n  const [problems,setProblems]')
 s=replace(s,'  const loadTwinDevices=async()=>{\n    setTwinDevices','  const loadTwinDevices=async()=>{\n    const sequence=++deviceLoadSequence.current;\n    setTwinDevices')
 s=replace(s,'return[item.storeId,{terminals:','return[twinScopeKey(item),{terminals:')
 s=replace(s,'    setTwinDevices({loading:false,rows:Object.fromEntries(entries)});','    if(sequence===deviceLoadSequence.current)setTwinDevices({loading:false,rows:Object.fromEntries(entries)});')
 s=replace(s,'useEffect(()=>{loadTwinDevices()},[companies]);','useEffect(()=>{loadTwinDevices();return()=>{deviceLoadSequence.current++}},[companies]);')
 s=replace(s,'      const open=cashDanger||cashReview?onOpenCash:payments.length?onOpenPayments:bank.length?onOpenBank:missingCash?onOpenCash:onOpenChecks;','      const destination=cashDanger||cashReview?"cash":payments.length?"payments":bank.length?"bank":missingCash?"cash":"checks";\n      const open={cash:onOpenCash,payments:onOpenPayments,bank:onOpenBank,checks:onOpenChecks}[destination];')
 s=replace(s,'state,label,reasons,open};','state,label,reasons,open,destination};')
 s=replace(s,'twinDevices.rows[store.id]','twinDevices.rows[twinScopeKey({companyId:company.id,storeId:store.id})]')
 s=replace(s,'    const unavailable=selectedTwin.devices.unavailable,video=selectedTwin.devices.video,stock=selectedTwin.stock,workforce=selectedTwin.workforce;','    const unavailable=selectedTwin.devices.unavailable,video=selectedTwin.devices.video,stock=selectedTwin.stock,workforce=selectedTwin.workforce;\n    const open=(destination,fallback)=>()=>onOpenTwinDestination?onOpenTwinDestination(destination,{companyId:selectedTwin.companyId,storeId:selectedTwin.id}):fallback?.();')
 start=s.index('  const fullTwinAreas=useMemo(');end=s.index('  const fullTwinTotals=',start)
 area=s[start:end]
 area=replace(area,'open:onOpenChecks}','open:open("checks",onOpenChecks)}')
 area=replace(area,'open:onOpenCash}','open:open("cash",onOpenCash)}')
 area=replace(area,'open:selectedTwin.status.open}','open:open(selectedTwin.status.destination||"checks",selectedTwin.status.open)}')
 for k,cb in [('stock','Stock'),('workforce','Workforce'),('video','Video')]:
  area=replace(area,f'open:()=>onOpen{cb}?.(selectedTwin.companyId,selectedTwin.id)',f'open:open("{k}",()=>onOpen{cb}?.(selectedTwin.companyId,selectedTwin.id))')
 area=replace(area,'},[onOpenCash,','},[onOpenTwinDestination,onOpenCash,')
 s=s[:start]+area+s[end:]
 s=replace(s,'<div className="ai-full-twin-selector" aria-label="Επιλογή καταστήματος">','{navigationError&&<div role="alert" className="ai-command-problem-error">{navigationError}</div>}\n        <div className="ai-full-twin-selector" aria-label="Επιλογή καταστήματος">')
 s=replace(s,'<button type="button" key={area.id} className={area.state} onClick={area.open}>','<button type="button" key={area.id} className={area.state} onClick={area.open} disabled={navigationBusy}>')
 return s
edit('client/src/components/platform/AiCommandCenter.jsx',center)

def parent(s):
 s=replace(s,'useEffect,useMemo,useState','useEffect,useMemo,useRef,useState')
 s=replace(s,'import AiCommandCenter','import {TWIN_DESTINATIONS,resolveTwinContext,withTwinScope,twinScopeKey,guardTwinRequest,rememberTwinReturn,readTwinReturn,clearTwinReturn} from "./ai-command-twin-navigation.js";\nimport AiCommandCenter')
 s=replace(s,'  const [data,setData]=useState(null);','  const [returnedTwin]=useState(()=>localStorage.getItem("supportContext")?null:readTwinReturn(sessionStorage,user?.id));\n  useEffect(()=>{if(!localStorage.getItem("supportContext"))clearTwinReturn(sessionStorage)},[]);\n  const [data,setData]=useState(null);')
 s=replace(s,'const [showAiCommandCenter,setShowAiCommandCenter]=useState(false);\n  const [aiTwinSelection,setAiTwinSelection]=useState(null);','''const [showAiCommandCenter,setShowAiCommandCenter]=useState(Boolean(returnedTwin));
  const [aiTwinSelection,setAiTwinSelection]=useState(returnedTwin);
  const [aiTwinOrigin,setAiTwinOrigin]=useState(null);
  const [aiTwinNavigationError,setAiTwinNavigationError]=useState("");
  const aiTwinOriginRef=useRef(null),dataRef=useRef(data),cashLoadSequence=useRef(0);
  dataRef.current=data;
  const currentTwinOrigin=origin=>Boolean(origin&&aiTwinOriginRef.current===origin&&resolveTwinContext(dataRef.current?.companies,origin));
  const twinRequest=useMemo(()=>aiTwinOrigin?guardTwinRequest(request,()=>currentTwinOrigin(aiTwinOrigin)):request,[aiTwinOrigin]);
  const scopeFor=destination=>aiTwinOrigin?.destination===destination?aiTwinOrigin:null;
  const requestFor=destination=>scopeFor(destination)?twinRequest:request;
  const clearTwinOrigin=()=>{aiTwinOriginRef.current=null;setAiTwinOrigin(null);cashLoadSequence.current++};
  const returnFromTwin=destination=>{
    if(aiTwinOriginRef.current?.destination!==destination)return;
    clearTwinOrigin();setBusy("");setShowAiCommandCenter(true);
  };
  const closeAiCommandCenter=()=>{clearTwinOrigin();setBusy("");setShowAiCommandCenter(false)};
  const rememberTwinSelection=selection=>{
    const origin=aiTwinOriginRef.current;
    if(origin&&twinScopeKey(origin)!==twinScopeKey(selection)){clearTwinOrigin();setBusy("")}
    setAiTwinNavigationError("");setAiTwinSelection(selection);
  };
  const twinContext=resolveTwinContext(data?.companies,aiTwinOrigin);
  const twinCompanies=twinContext?[{...twinContext.company,stores:[twinContext.store]}]:[];
  useEffect(()=>{
    if(!aiTwinOrigin||!data||resolveTwinContext(data.companies,aiTwinOrigin))return;
    clearTwinOrigin();setCashReport(null);setAnalyticsResult(null);setShowSupplierSettlementReview(false);setShowBankLedgerReview(false);setVideoConnectionManager(null);setWorkforceTarget(null);setBusy("");
    setAiTwinNavigationError("Το κατάστημα δεν είναι πλέον διαθέσιμο. Επίλεξε ξανά κατάστημα στο Full Digital Twin.");setShowAiCommandCenter(true);
  },[data,aiTwinOrigin]);''')
 s=replace(s,'setAiTwinSelection(null);if(clearError)','setAiTwinSelection(null);clearTwinOrigin();clearTwinReturn(sessionStorage);setShowAiCommandCenter(false);setCashReport(null);setAnalyticsResult(null);setShowSupplierSettlementReview(false);setShowBankLedgerReview(false);setVideoConnectionManager(null);setWorkforceTarget(null);if(clearError)')
 s=replace(s,'const openCustomer=async(company,store,destination)=>{','const openCustomer=async(company,store,destination,twinOrigin=null)=>{')
 s=replace(s,'const result=await request(`/api/platform/companies/${company.id}/support-access`','const accessRequest=twinOrigin?guardTwinRequest(request,()=>currentTwinOrigin(twinOrigin)):request;\n      const result=await accessRequest(`/api/platform/companies/${company.id}/support-access`')
 s=replace(s,'      sessionStorage.setItem("platformToken",','''      if(twinOrigin&&!rememberTwinReturn(sessionStorage,twinOrigin,user?.id))throw new Error("Δεν αποθηκεύτηκε η επιστροφή στο Full Digital Twin. Δοκίμασε ξανά.");
      if(!twinOrigin)clearTwinReturn(sessionStorage);
      sessionStorage.setItem("platformToken",''')
 start=s.index('  const openCustomer=');end=s.index('  const checkReadiness=',start)
 part=replace(s[start:end],'}catch(err){setError(err.message);setBusy("")}','}catch(err){if(twinOrigin)throw err;setError(err.message);setBusy("")}')
 s=s[:start]+part+s[end:]
 old='''  const loadCashReport=async(date=cashReportDate)=>{
    setBusy("cash-report");setError("");
    try{setCashReport(await request(`/api/platform/cash-control/daily?${new URLSearchParams({date,fromTime:cashFromTime,toTime:cashToTime,...(cashStoreId?{storeId:cashStoreId}:{})})}`))}catch(err){setError(err.message)}finally{setBusy("")}
  };'''
 new='''  const loadCashReport=async(date=cashReportDate,twinOrigin=aiTwinOriginRef.current?.destination==="cash"?aiTwinOriginRef.current:null)=>{
    const sequence=++cashLoadSequence.current;
    setBusy("cash-report");setError("");
    try{
      const api=twinOrigin?guardTwinRequest(request,()=>currentTwinOrigin(twinOrigin)):request;
      const filters=withTwinScope({date,fromTime:cashFromTime,toTime:cashToTime,...(cashStoreId?{storeId:cashStoreId}:{})},twinOrigin);
      const result=await api(`/api/platform/cash-control/daily?${new URLSearchParams(filters)}`);
      if(sequence!==cashLoadSequence.current)return false;
      setCashReport(result);return true;
    }catch(err){if(twinOrigin)throw err;if(sequence===cashLoadSequence.current)setError(err.message);return false}
    finally{if(sequence===cashLoadSequence.current)setBusy("")}
  };
  const refreshCashReport=()=>loadCashReport(cashReportDate).catch(err=>setError(err.message));
  const closeCashReport=()=>{cashLoadSequence.current++;setCashReport(null);returnFromTwin("cash")};
  const openTwinDestination=async(destination,selection)=>{
    if(!TWIN_DESTINATIONS.has(destination)||aiTwinOriginRef.current)return;
    const context=resolveTwinContext(dataRef.current?.companies,selection);
    if(!context){setAiTwinNavigationError("Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο. Επίλεξέ το ξανά.");return}
    const origin={companyId:selection.companyId,storeId:selection.storeId,destination};
    aiTwinOriginRef.current=origin;setAiTwinOrigin(origin);setAiTwinSelection(selection);setAiTwinNavigationError("");
    const {company,store}=context,api=guardTwinRequest(request,()=>currentTwinOrigin(origin));
    try{
      if(destination==="cash"){if(!await loadCashReport(cashReportDate,origin))return}
      else if(destination==="video"){
        setBusy(`video:${store.id}`);
        const result=await api(`/api/platform/companies/${company.id}/stores/${store.id}/video-connection`);
        setVideoConnectionManager({...result,company,store});
      }
      else if(destination==="stock"){await openCustomer(company,store,"BACKOFFICE",origin);return}
      else if(destination==="checks")setAnalyticsResult({page:true});
      else if(destination==="payments")setShowSupplierSettlementReview(true);
      else if(destination==="bank")setShowBankLedgerReview(true);
      else if(destination==="workforce")setWorkforceTarget({company,store});
      if(currentTwinOrigin(origin)){setShowAiCommandCenter(false);setBusy("")}
    }catch(err){
      if(aiTwinOriginRef.current!==origin)return;
      clearTwinOrigin();setBusy("");setAiTwinNavigationError(err.message||"Δεν άνοιξε η οθόνη του καταστήματος.");setShowAiCommandCenter(true);
    }
  };'''
 s=replace(s,old,new)
 start=s.index('  const previewAndSendCashReport=');end=s.index('  if(!user)return',start)
 part=s[start:end].replace('await request(','await requestFor("cash")(')
 part=replace(part,'...(store?{storeId:store.storeId}:{}),','...(scopeFor("cash")?{companyId:scopeFor("cash").companyId,storeId:scopeFor("cash").storeId}:store?{storeId:store.storeId}:{}),')
 part=replace(part,'store?.storeName||"Όλα-τα-καταστήματα"','store?.storeName||(scopeFor("cash")?twinContext?.store.name:"Όλα-τα-καταστήματα")')
 s=s[:start]+part+s[end:]
 s=replace(s,'onClick={()=>setCashReport(null)}','onClick={closeCashReport}')
 s=replace(s,'<select value={cashStoreId} onChange={event=>setCashStoreId(event.target.value)}><option value="">Όλα τα καταστήματα</option>','<select value={scopeFor("cash")?.storeId||cashStoreId} disabled={Boolean(scopeFor("cash"))} onChange={event=>{cashLoadSequence.current++;setCashStoreId(event.target.value)}}>{!scopeFor("cash")&&<option value="">Όλα τα καταστήματα</option>}')
 s=replace(s,'onClick={()=>loadCashReport(cashReportDate)}','onClick={refreshCashReport}')
 s=replace(s,'"Δημιουργία…":"Excel ελλειμμάτων όλων"','"Δημιουργία…":scopeFor("cash")?"Excel ελλειμμάτων καταστήματος":"Excel ελλειμμάτων όλων"')
 s=replace(s,'onTwinSelectionChange={setAiTwinSelection}','onTwinSelectionChange={rememberTwinSelection}\n      onOpenTwinDestination={openTwinDestination} navigationBusy={Boolean(aiTwinOrigin)} navigationError={aiTwinNavigationError}')
 s=replace(s,'onClose={()=>setShowAiCommandCenter(false)} onRefresh={load}','onClose={closeAiCommandCenter} onRefresh={load}')
 s=replace(s,'{videoConnectionManager&&<VideoConnectionManager manager={videoConnectionManager} request={request} onClose={()=>setVideoConnectionManager(null)}','{videoConnectionManager&&<VideoConnectionManager manager={videoConnectionManager} request={requestFor("video")} onClose={()=>{setVideoConnectionManager(null);returnFromTwin("video")}}')
 s=replace(s,'{analyticsResult?.page&&<SuperAdminChecksAnalytics embedded companies={data?.companies||[]} request={request} onClose={()=>setAnalyticsResult(null)}','{analyticsResult?.page&&<SuperAdminChecksAnalytics key={scopeFor("checks")?twinScopeKey(aiTwinOrigin):"central"} entryScope={scopeFor("checks")} embedded companies={scopeFor("checks")?twinCompanies:data?.companies||[]} request={requestFor("checks")} onClose={()=>{setAnalyticsResult(null);returnFromTwin("checks")}}')
 s=replace(s,'{showSupplierSettlementReview&&<SupplierSettlementReviewCenter request={request} onClose={()=>setShowSupplierSettlementReview(false)}','{showSupplierSettlementReview&&<SupplierSettlementReviewCenter key={scopeFor("payments")?twinScopeKey(aiTwinOrigin):"central"} entryScope={scopeFor("payments")} request={requestFor("payments")} onClose={()=>{setShowSupplierSettlementReview(false);returnFromTwin("payments")}}')
 s=replace(s,'{showBankLedgerReview&&<BankLedgerReviewCenter request={request} onClose={()=>setShowBankLedgerReview(false)}','{showBankLedgerReview&&<BankLedgerReviewCenter key={scopeFor("bank")?twinScopeKey(aiTwinOrigin):"central"} entryScope={scopeFor("bank")} request={requestFor("bank")} onClose={()=>{setShowBankLedgerReview(false);returnFromTwin("bank")}}')
 s=replace(s,'{workforceTarget&&<SuperAdminStaffScheduler {...workforceTarget} companies={data?.companies||[]} request={request} onClose={()=>setWorkforceTarget(null)}/>}','{workforceTarget&&<SuperAdminStaffScheduler {...workforceTarget} companies={scopeFor("workforce")?twinCompanies:data?.companies||[]} request={requestFor("workforce")} onClose={()=>{setWorkforceTarget(null);returnFromTwin("workforce")}}/>}')
 return s
edit('client/src/components/platform/PlatformAdminApp.jsx',parent)

imports='import {withTwinScope,validTwinScope,guardTwinRequest} from "./ai-command-twin-navigation.js";\n'
setup='''  const scopeValid=entryScope===null||validTwinScope(entryScope);
  const request=useMemo(()=>entryScope===null?baseRequest:guardTwinRequest(baseRequest,()=>validTwinScope(entryScope)),[baseRequest,entryScope]);
  const filters=scopeValid?withTwinScope(filterState,entryScope):{...filterState,companyId:"",storeId:""};
'''
def lock_selects(s):
 for field in ['companyId','storeId']:
  s=replace(s,f'<select value={{filters.{field}}}',f'<select disabled={{entryScope!==null}} value={{filters.{field}}}')
 for label in ['Όλοι οι ιδιοκτήτες / εταιρείες','Όλα τα καταστήματα']:
  s=replace(s,f'<option value="">{label}</option>',f'{{entryScope===null&&<option value="">{label}</option>}}')
 return s

def checks(s):
 s=replace(s,'useEffect,useMemo,useState','useEffect,useMemo,useRef,useState');s=imports+s
 s=replace(s,'{companies=[],request,onClose,setMessage,embedded=false}','{companies=[],request:baseRequest,onClose,setMessage,embedded=false,entryScope=null}')
 s=replace(s,'const [filters,setFilters]=useState(emptyFilters);','const [filterState,setFilters]=useState(emptyFilters);\n'+setup+'  const runSequence=useRef(0);')
 s=replace(s,'  const updateFilters=patch=>{\n    setFilters','  const updateFilters=patch=>{\n    runSequence.current++;setBusy(false);\n    setFilters')
 s=replace(s,'  const run=async()=>{','  const run=async()=>{\n    const sequence=++runSequence.current;')
 s=replace(s,'      setResult({analytics,bank,bankReview,supplierReview,expenseReview,filters:','      if(sequence!==runSequence.current)return;\n      setResult({analytics,bank,bankReview,supplierReview,expenseReview,filters:')
 s=replace(s,'}catch(err){setError(err.message)}finally{setBusy(false)}','}catch(err){if(sequence===runSequence.current)setError(err.message)}finally{if(sequence===runSequence.current)setBusy(false)}')
 s=replace(s,'  const clear=()=>{\n    setFilters','  const clear=()=>{\n    runSequence.current++;setBusy(false);\n    setFilters')
 s=replace(s,'  const storeIsSelected=Boolean(filters.companyId&&filters.storeId);','  useEffect(()=>()=>{runSequence.current++},[entryScope?.companyId,entryScope?.storeId]);\n  const storeIsSelected=Boolean(filters.companyId&&filters.storeId);')
 s=lock_selects(s)
 s=replace(s,'    {error&&<div className="platform-alert error">{error}</div>}','    {(!scopeValid||error)&&<div role="alert" className="platform-alert error">{!scopeValid?"Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο.":error}</div>}')
 return s
edit('client/src/components/platform/SuperAdminChecksAnalytics.jsx',checks)

def supplier(s):
 s=replace(s,'useEffect,useMemo,useState','useEffect,useMemo,useRef,useState');s=imports+s
 s=replace(s,'{request,onClose,setMessage}','{request:baseRequest,onClose,setMessage,entryScope=null}')
 s=replace(s,'const [filters,setFilters]=useState({companyId:"",storeId:"",from:"",to:""});','const [filterState,setFilters]=useState({companyId:"",storeId:"",from:"",to:""});\n'+setup+'  const loadSequence=useRef(0);')
 s=replace(s,'  const load=async()=>{','  const load=async()=>{\n    const sequence=++loadSequence.current;')
 s=replace(s,'      setItems(result.items||[]);','      if(sequence!==loadSequence.current)return;\n      setItems(result.items||[]);')
 s=replace(s,'}catch(err){setError(err.message)}finally{setLoading(false)}','}catch(err){if(sequence===loadSequence.current)setError(err.message)}finally{if(sequence===loadSequence.current)setLoading(false)}')
 s=replace(s,'useEffect(()=>{load()},[]);','useEffect(()=>{load();return()=>{loadSequence.current++}},[entryScope?.companyId,entryScope?.storeId]);')
 s=replace(s,'const updateFilter=(key,value)=>setFilters(current=>({...current,[key]:value,...(key==="companyId"?{storeId:""}:{})}));','const updateFilter=(key,value)=>{loadSequence.current++;setItems([]);setLoading(false);setFilters(current=>({...current,[key]:value,...(key==="companyId"?{storeId:""}:{})}))};')
 s=lock_selects(s)
 s=replace(s,'    {error&&<div className="platform-alert error">{error}</div>}','    {(!scopeValid||error)&&<div role="alert" className="platform-alert error">{!scopeValid?"Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο.":error}</div>}')
 return s
edit('client/src/components/platform/SupplierSettlementReviewCenter.jsx',supplier)

def bank(s):
 s=replace(s,'useEffect,useState','useEffect,useMemo,useRef,useState');s=imports+s
 s=replace(s,'{request,onClose,setMessage,companies=[],stores=[]}','{request:baseRequest,onClose,setMessage,companies=[],stores=[],entryScope=null}')
 s=replace(s,'[filters,setFilters]=useState(','[filterState,setFilters]=useState(')
 at=s.index(' const visibleStores=');s=s[:at]+setup+' const loadSequence=useRef(0);\n'+s[at:]
 s=replace(s,'const load=async()=>{setBusy("load");','const load=async()=>{const sequence=++loadSequence.current;setBusy("load");')
 s=replace(s,'setItems(review.items||[]);setSummary','if(sequence!==loadSequence.current)return;setItems(review.items||[]);setSummary')
 s=replace(s,'}catch(e){setError(e.message)}finally{setBusy("")}};\n useEffect(()=>{load()},[]);','}catch(e){if(sequence===loadSequence.current)setError(e.message)}finally{if(sequence===loadSequence.current)setBusy("")}};\n useEffect(()=>{load();return()=>{loadSequence.current++}},[entryScope?.companyId,entryScope?.storeId]);')
 s=replace(s,' return <div className="platform-modal">',' const changeFilter=patch=>{loadSequence.current++;setItems([]);setSummary({items:[],totals:{}});setBusy("");setFilters(current=>({...current,...patch}))};\n return <div className="platform-modal">')
 s=replace(s,'onChange={event=>setFilters(current=>({...current,companyId:event.target.value,storeId:""}))}','onChange={event=>changeFilter({companyId:event.target.value,storeId:""})}')
 s=replace(s,'onChange={event=>setFilters(current=>({...current,storeId:event.target.value}))}','onChange={event=>changeFilter({storeId:event.target.value})}')
 s=lock_selects(s)
 s=replace(s,'{error&&<div className="platform-alert error">{error}</div>}','{(!scopeValid||error)&&<div role="alert" className="platform-alert error">{!scopeValid?"Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο.":error}</div>}')
 return s
edit('client/src/components/platform/BankLedgerReviewCenter.jsx',bank)

# Update only this owner's existing records; other owners' text remains byte-for-byte.
marker='N40-SCOPED-NAVIGATION-20261010'
entry='''

## N40-SCOPED-NAVIGATION-20261010 — canonical destinations / SOURCE / AWAITING CI AND LAB

Same owner `codex/n40-full-twin-navigation-audit-20261010`; source `fix/n40-twin-navigation-20261010`. Prior claimPR2040, selectionPR2046 and handoffPR2047 are merged. This continuation carries the exact company/store to the six Full Digital Twin destinations, locks scoped entry filters/refresh/export and returns to the same Twin on close; Stock retains the existing support exchange with a non-secret, one-use actor-bound return hint. Late destination/device responses are rejected. Canonical central entry and visual phases1–14 are preserved. No business flow, authorization, API, schema, financial/stock/fiscal/camera/billing mutation. Local pure helper tests PASS; supported Node20 mounted/full CI and authenticated LAB are separate. Full40 OPEN; no manual PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-10-n40-scoped-navigation.md`. Final runner/PR/CI/revision evidence will supersede only the pending source-validation status here.
'''
import re
for name in ['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/PENDING_WORK.md','docs/roadmap/OPEN_WORK_TRACKER.md']:
 p=Path(name);text=p.read_text();assert marker not in text
 if name.endswith('OPEN_WORK_TRACKER.md'):
  m=re.search(r'^### AI-CC-LIMITS .*?(?=^### |\Z)',text,re.M|re.S);assert m and 'codex/n40-full-twin-navigation-audit-20261010' in m.group()
  text=text[:m.end()]+entry+'\n'+text[m.end():]
 else:
  needle='CHECKPOINTS/CHANGES/2026-10-10-n40-selection-guard.md';at=text.find(needle);assert at>=0
  end=text.find('\n\n',at);assert end>=0
  text=text[:end]+entry+text[end:]
 p.write_text(text)
print('N40 exact-anchor implementation and same-owner records prepared')
