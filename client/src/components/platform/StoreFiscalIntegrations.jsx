import React,{useEffect,useState} from "react";
import {KeyRound,ShieldCheck,X} from "lucide-react";

const definitions=[
  {kind:"MYDATA",title:"myDATA / Ηλεκτρονική τιμολόγηση",account:"User ID / Αναγνωριστικό",secret:"Κωδικός / Subscription key"},
  {kind:"VAT_LOOKUP",title:"Εύρεση επιχείρησης μέσω ΑΦΜ",account:"User ID / Client ID",secret:"Κωδικός / API key"}
];

const LAB_COMPANY="MYWORKSTATION LAB";
const LAB_STORE="ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ";

export default function StoreFiscalIntegrations({manager,request,onClose,onChanged}){
  const [saving,setSaving]=useState("");
  const [error,setError]=useState("");
  const [efood,setEfood]=useState(undefined);
  const [efoodLabAllowed,setEfoodLabAllowed]=useState(false);
  const [labResult,setLabResult]=useState(null);
  const current=kind=>manager.integrations.find(row=>row.kind===kind);
  const efoodUrl=`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/efood`;

  const applyEfoodResponse=result=>{
    setEfood(result.integration||null);
    setEfoodLabAllowed(result.labAllowed===true);
    if(result.labAllowed!==true)setLabResult(null);
    return result;
  };
  const loadEfood=async()=>applyEfoodResponse(await request(efoodUrl));

  useEffect(()=>{
    let active=true;
    request(efoodUrl).then(result=>{if(active)applyEfoodResponse(result)}).catch(err=>{if(active){setEfood(null);setEfoodLabAllowed(false);setError(err.message)}});
    return()=>{active=false};
  },[manager.company.id,manager.store.id]);

  const submit=kind=>async event=>{
    event.preventDefault();setSaving(kind);setError("");const formElement=event.currentTarget;const form=new FormData(formElement);
    try{
      await request(`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/integrations/${kind}`,{method:"PUT",body:JSON.stringify({providerName:form.get("providerName"),environment:form.get("environment"),accountId:form.get("accountId"),secret:form.get("secret"),enabled:true})});
      formElement.reset();await onChanged();
    }catch(err){setError(err.message)}finally{setSaving("")}
  };

  const submitEfood=async event=>{
    event.preventDefault();setSaving("EFOOD");setError("");setLabResult(null);const formElement=event.currentTarget;const form=new FormData(formElement);
    try{
      await request(efoodUrl,{method:"PUT",body:JSON.stringify({providerName:form.get("providerName"),environment:"SANDBOX",chainId:form.get("chainId"),vendorId:form.get("vendorId"),externalPartnerConfigId:form.get("externalPartnerConfigId"),clientId:form.get("clientId"),clientSecret:form.get("clientSecret"),webhookSecret:form.get("webhookSecret")})});
      for(const name of ["clientId","clientSecret","webhookSecret"]){if(formElement.elements[name])formElement.elements[name].value=""}
      await loadEfood();
    }catch(err){setError(err.message)}finally{setSaving("")}
  };

  const runEfoodLabValidation=async()=>{
    if(!efoodLabAllowed)return setError(`Η δοκιμή επιτρέπεται μόνο στο ${LAB_COMPANY} / ${LAB_STORE}.`);
    if(!efood)return setError("Προετοίμασε πρώτα τη διασύνδεση efood στο LAB.");
    setSaving("EFOOD_LAB_TEST");setError("");setLabResult(null);
    try{
      const runId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.toUpperCase();
      const vendorId=efood.metadata?.vendorId||"LAB-TEST-VENDOR";
      const partnerConfig=efood.metadata?.externalPartnerConfigId||undefined;
      const orderId=`LAB-EFOOD-${runId}`;
      const sku=`LAB-SKU-${runId}`;
      const item={id:sku,sku,name:"LAB EFOOD TEST PRODUCT",quantity:1};
      const readyPayload={event_id:`LAB-READY-${runId}`,event_type:"READY_FOR_PICKUP",store_id:vendorId,external_partner_config_id:partnerConfig,order:{id:orderId,status:"READY_FOR_PICKUP",items:[item]}};
      const ready=await request(`${efoodUrl}/mock-webhook`,{method:"POST",body:JSON.stringify({payload:readyPayload})});
      const replay=await request(`${efoodUrl}/mock-webhook`,{method:"POST",body:JSON.stringify({payload:readyPayload})});
      const cancelled=await request(`${efoodUrl}/mock-webhook`,{method:"POST",body:JSON.stringify({payload:{...readyPayload,event_id:`LAB-CANCEL-${runId}`,event_type:"CANCELLED",order:{...readyPayload.order,status:"CANCELLED"}}})});
      const catalog=await request(`${efoodUrl}/previews/CATALOG`,{method:"POST",body:JSON.stringify({vendorId,products:[{externalProductId:sku,name:"LAB EFOOD TEST PRODUCT",price:1,stock:1,available:true}]})});
      const promo=await request(`${efoodUrl}/previews/PROMO`,{method:"POST",body:JSON.stringify({vendorId,promotions:[{externalPromotionId:`LAB-PROMO-${runId}`,externalProductId:sku,title:"LAB EFOOD TEST PROMO",discountPercent:10,active:true}]})});
      const now=new Date(),from=new Date(now.getTime()-60*60*1000);
      const orders=await request(`${efoodUrl}/previews/ORDERS`,{method:"POST",body:JSON.stringify({vendorId,externalPartnerConfigId:partnerConfig,from:from.toISOString(),to:now.toISOString()})});
      const readiness=await request(`${efoodUrl}/readiness`);
      const events=await request(`${efoodUrl}/events`);
      const noSideEffects=[ready,replay,cancelled].every(row=>row.externalCall===false&&row.orderCreated===false&&row.saleCreated===false&&row.stockChanged===false&&row.paymentPosted===false&&row.fiscalExecution===false);
      const previewsLocal=[catalog,promo,orders].every(row=>row.externalCall===false&&row.environment==="SANDBOX");
      const passed=noSideEffects&&previewsLocal&&ready.status==="READY_FOR_PICKUP"&&replay.idempotent===true&&cancelled.status==="CANCELLED"&&readiness.externalCallsEnabled===false&&readiness.webhookAcceptingLiveEvents===false;
      setLabResult({passed,runId,orderId,ready,replay,cancelled,catalog,promo,orders,readiness,eventCount:events.events?.length||0});
    }catch(err){setError(err.message)}finally{setSaving("")}
  };

  const toggle=async row=>{
    setSaving(row.kind);setError("");
    try{await request(`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/integrations/${row.kind}/status`,{method:"PATCH",body:JSON.stringify({enabled:!row.enabled})});await onChanged()}
    catch(err){setError(err.message)}finally{setSaving("")}
  };

  return <div className="platform-modal"><section className="platform-security-dialog fiscal-integrations-dialog">
    <button type="button" className="modal-close" onClick={onClose}><X/></button>
    <h2>Ασφαλείς διασυνδέσεις καταστήματος</h2>
    <p>{manager.company.name} · <b>{manager.store.name}</b></p>
    <div className="terminal-explainer"><ShieldCheck/><span>Οι κωδικοί κρυπτογραφούνται στον server, δεν επιστρέφονται ποτέ στην οθόνη και δεν αποθηκεύονται στον κώδικα ή στο GitHub.</span></div>
    {error&&<div className="platform-error">{error}</div>}
    <div className="fiscal-integrations-grid">
      {definitions.map(def=>{const row=current(def.kind);return <form key={def.kind} onSubmit={submit(def.kind)}>
        <div className="fiscal-integration-heading"><KeyRound/><div><h3>{def.title}</h3><span className={row?.enabled?"configured":""}>{row?`${row.enabled?"ΕΝΕΡΓΗ":"ΑΝΕΝΕΡΓΗ"} · ${row.accountHint}`:"ΔΕΝ ΕΧΕΙ ΡΥΘΜΙΣΤΕΙ"}</span></div></div>
        <label>Πάροχος / Υπηρεσία<input name="providerName" defaultValue={row?.providerName||""} placeholder="π.χ. AADE ή όνομα παρόχου" required/></label>
        <label>Περιβάλλον<select name="environment" defaultValue={row?.environment||"PRODUCTION"}><option value="PRODUCTION">Παραγωγή</option><option value="SANDBOX">Δοκιμαστικό</option></select></label>
        <label>{def.account}<input name="accountId" autoComplete="off" required/></label>
        <label>{def.secret}<input name="secret" type="password" autoComplete="new-password" required/></label>
        <small>Για αλλαγή κωδικών συμπλήρωσε ξανά και τα δύο μυστικά πεδία. Οι προηγούμενες τιμές δεν εμφανίζονται.</small>
        <div className="platform-form-actions">{row&&<button type="button" className="secondary" onClick={()=>toggle(row)} disabled={saving===def.kind}>{row.enabled?"Απενεργοποίηση":"Ενεργοποίηση"}</button>}<button disabled={saving===def.kind}>{saving===def.kind?"Αποθήκευση…":row?"Αλλαγή κωδικών":"Ασφαλής αποθήκευση"}</button></div>
      </form>})}

      {efood===undefined
        ?<div className="terminal-explainer"><ShieldCheck/><span>Φόρτωση προετοιμασίας efood…</span></div>
        :!efoodLabAllowed
          ?<div className="terminal-explainer"><ShieldCheck/><span><b>efood / Pelican κλειδωμένο.</b> Η προετοιμασία και όλες οι δοκιμές επιτρέπονται μόνο στο {LAB_COMPANY} · {LAB_STORE}. Δεν έγινε καμία αλλαγή στο επιλεγμένο πραγματικό κατάστημα.</span></div>
          :<form key={efood?.updatedAt||"efood-new"} onSubmit={submitEfood}>
            <div className="fiscal-integration-heading"><KeyRound/><div><h3>efood / Pelican — Indirect POS</h3><span className={efood?"configured":""}>{efood?`${efood.phase==="AWAITING_TEST_VENDOR"?"ΑΝΑΜΟΝΗ TEST VENDOR":"ΡΥΘΜΙΣΜΕΝΗ — ΟΧΙ ΕΝΕΡΓΗ"}${efood.accountHint?` · ${efood.accountHint}`:""}`:"LAB — ΔΕΝ ΕΧΕΙ ΠΡΟΕΤΟΙΜΑΣΤΕΙ"}</span></div></div>
            <div className="terminal-explainer"><ShieldCheck/><span><b>Αποκλειστικά {LAB_COMPANY} · {LAB_STORE}.</b> Μόνο SANDBOX/local mock. Το live webhook, η δημιουργία παραγγελίας, το stock, οι πληρωμές και η φορολογική έκδοση παραμένουν κλειδωμένα μέχρι test vendor, E2E LAB PASS και νέα έγκριση.</span></div>
            <label>Πάροχος / Υπηρεσία<input name="providerName" defaultValue={efood?.providerName||"efood / Delivery Hero"} required/></label>
            <label>Περιβάλλον<input value="SANDBOX — MYWORKSTATION LAB" readOnly/></label>
            <label>Chain ID<input name="chainId" defaultValue={efood?.metadata?.chainId||""} autoComplete="off" placeholder="Θα δοθεί από efood"/></label>
            <label>Vendor / Store ID<input name="vendorId" defaultValue={efood?.metadata?.vendorId||""} autoComplete="off" placeholder="Test vendor ID"/></label>
            <label>External partner config ID<input name="externalPartnerConfigId" defaultValue={efood?.metadata?.externalPartnerConfigId||""} autoComplete="off" placeholder="Προαιρετικό mapping ID"/></label>
            <label>Client ID<input name="clientId" autoComplete="off" placeholder={efood?.accountHint?`Ήδη αποθηκευμένο ${efood.accountHint}`:"Θα δοθεί από efood"}/></label>
            <label>Client Secret<input name="clientSecret" type="password" autoComplete="new-password" placeholder="Δεν εμφανίζεται μετά την αποθήκευση"/></label>
            <label>Ακριβής τιμή Authorization webhook<input name="webhookSecret" type="password" autoComplete="new-password" placeholder="π.χ. Basic … — θα δοθεί στο portal"/></label>
            {efood?.webhookPath&&<label>Μελλοντικό callback path<input value={efood.webhookPath} readOnly/></label>}
            <small>Τα κενά μυστικά πεδία δεν διαγράφουν όσα έχουν ήδη αποθηκευτεί. Η αποθήκευση δεν ενεργοποιεί εξωτερική κλήση ή πραγματική παραγγελία.</small>
            <div className="platform-form-actions">
              <button disabled={saving==="EFOOD"}>{saving==="EFOOD"?"Αποθήκευση…":efood?"Ενημέρωση προετοιμασίας":"Προετοιμασία efood στο LAB"}</button>
              <button type="button" className="secondary" onClick={runEfoodLabValidation} disabled={!efood||saving==="EFOOD_LAB_TEST"}>{saving==="EFOOD_LAB_TEST"?"Εκτέλεση LAB ελέγχου…":"Πλήρης ασφαλής LAB δοκιμή"}</button>
            </div>
            {labResult&&<div className={labResult.passed?"terminal-explainer":"platform-error"}><ShieldCheck/><span><b>{labResult.passed?"LAB MOCK PASS":"LAB MOCK FAIL"}</b><br/>Run: {labResult.runId}<br/>READY_FOR_PICKUP: {labResult.ready.processingStatus} · replay idempotent: {String(labResult.replay.idempotent)} · CANCELLED: {labResult.cancelled.processingStatus}<br/>Catalog/Promo/Orders previews: LOCAL/SANDBOX · Events: {labResult.eventCount}<br/>External call: ΟΧΙ · Order/Sale: ΟΧΙ · Stock: ΟΧΙ · Payment/Fiscal: ΟΧΙ</span></div>}
          </form>}
    </div>
  </section></div>;
}
