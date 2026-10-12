import React,{useEffect,useRef,useState} from "react";
import "./efood-event-preview.css";

const reasons={MAPPING_MISSING:"Δεν υπάρχει αντιστοίχιση",MAPPING_UNCONFIRMED:"Δεν έχει επιβεβαιωθεί προϊόν",AMBIGUOUS_MAPPING:"Αντικρουόμενες αντιστοιχίσεις",PRODUCT_NOT_IN_SELECTED_STORE:"Το προϊόν δεν ανήκει στον επιλεγμένο κατάλογο"};

export default function EfoodEventPreview({url,request}){
  const [state,setState]=useState({events:[],eventId:"",preview:null,error:"",busy:false,loaded:false});
  const generation=useRef(0),scope=useRef(url),pending=useRef(false);
  scope.current=url;
  useEffect(()=>{generation.current++;pending.current=false;setState({events:[],eventId:"",preview:null,error:"",busy:false,loaded:false});return()=>{generation.current++;pending.current=false}},[url]);
  const run=async task=>{
    if(pending.current)return;
    pending.current=true;const token=generation.current,selectedUrl=url;
    setState(value=>({...value,busy:true,error:"",preview:null}));
    const current=()=>token===generation.current&&scope.current===selectedUrl;
    try{const result=await task();if(current())setState(value=>({...value,...result,error:""}))}
    catch(error){if(current())setState(value=>({...value,error:error.message||"Δεν ήταν δυνατή η ανάγνωση."}))}
    finally{if(current()){pending.current=false;setState(value=>({...value,busy:false}))}}
  };
  const load=()=>run(async()=>{const result=await request(`${url}/event-previews`);const events=result.events||[];return {events,eventId:events[0]?.id||"",preview:null,loaded:true}});
  const read=()=>state.eventId&&run(async()=>({preview:await request(`${url}/events/${encodeURIComponent(state.eventId)}/preview`)}));
  return <section className="efood-event-preview" aria-label="Προεπισκόπηση αποθηκευμένης παραγγελίας efood">
    <h3>Έλεγχος προϊόντων efood</h3>
    <p>Διαβάζει ήδη αποθηκευμένο event. Δεν στέλνει νέα δοκιμή και δεν δημιουργεί εμπορική συναλλαγή.</p>
    <button type="button" onClick={load} disabled={state.busy}>{state.busy?"Ανάγνωση…":"Εμφάνιση αποθηκευμένων events"}</button>
    {state.loaded&&!state.events.length&&<p>Δεν βρέθηκαν αποθηκευμένα events στο επιλεγμένο LAB.</p>}
    {state.events.length>0&&<><label>Επίλεξε event<select value={state.eventId} disabled={state.busy} onChange={event=>setState(value=>({...value,eventId:event.target.value,preview:null,error:""}))}>{state.events.map(event=><option key={event.id} value={event.id}>{event.externalOrderId||event.id} · {event.externalStatus}</option>)}</select></label><button type="button" onClick={read} disabled={state.busy||!state.eventId}>Προεπισκόπηση προϊόντων</button></>}
    {state.error&&<p role="alert">{state.error}</p>}
    {state.preview&&<div className="efood-event-preview-result"><p><b>Event:</b> {state.preview.eventId}<br/><b>Κατάστημα efood:</b> {state.preview.providerStoreId}<br/><b>Κατάσταση:</b> {state.preview.status} · {state.preview.mode}</p>
      {state.preview.items.map(item=><article key={item.line}><div><strong>{item.name||item.externalSku||"Προϊόν"}</strong><b>Ποσότητα: {item.quantity}</b></div><p>SKU: {item.externalSku||"—"}<br/>Barcode: {item.barcodes.join(", ")||"—"}</p><p className={item.mappingStatus==="MATCHED"?"matched":"unmatched"}>{item.mappingStatus==="MATCHED"?`Αντιστοίχιση: ${item.product?.name||item.product?.id}`:reasons[item.reason]||"Προς έλεγχο"}</p></article>)}
      <p><b>{state.preview.mappingComplete?"Οι αντιστοιχίσεις προϊόντων συμφωνούν.":"Η αντιστοίχιση προϊόντων εκκρεμεί."}</b> Οι τιμές, οι πληρωμές, η διαθεσιμότητα και η ενεργοποίηση Pelican χρειάζονται ξεχωριστή επιβεβαίωση.</p>
    </div>}
  </section>;
}
