import React,{useEffect,useRef,useState} from 'react';

const maxSelectedAttachments=10;
const canRead=source=>source.reading?.status==='NOT_READ'&&Boolean(source.checksum&&source.references?.[0]?.messageId);
const labels={NOT_READ:'Δεν έχει αναγνωστεί',PENDING:'Αναμονή αποτελέσματος — μην υποβάλεις νέο αίτημα',REQUIRES_REVIEW:'Το προηγούμενο αίτημα χρειάζεται έλεγχο',EXTRACTED_UNVERIFIED:'Αναγνώστηκε — προς αντιστοίχιση'};
export default function CashPaperReadingPanel({api,storeId}){
  const [opened,setOpened]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState([]);
  const sequence=useRef(0),selectedStore=useRef(storeId),busyRef=useRef(false);selectedStore.current=storeId;
  useEffect(()=>{sequence.current++;setOpened(false);setData(null);setSelected([]);setError('');setBusy(false);busyRef.current=false;return()=>{sequence.current++;};},[storeId]);
  const load=async()=>{
    if(!storeId||busyRef.current)return;
    const ownStore=storeId,id=++sequence.current;busyRef.current=true;setBusy(true);setError('');setData(null);setSelected([]);
    try{const result=await api(`/api/cash-papers/stores/${encodeURIComponent(ownStore)}`);if(id===sequence.current&&selectedStore.current===ownStore){if(result?.storeId!==ownStore||typeof result.generation!=='string')throw Error('Δεν επιβεβαιώθηκε το κατάστημα. Ανανέωσε τα στοιχεία.');setData(result);}}
    catch(e){if(id===sequence.current&&selectedStore.current===ownStore)setError(e.message||'Δεν φορτώθηκαν τα χειρόγραφα.');}
    finally{if(id===sequence.current&&selectedStore.current===ownStore){busyRef.current=false;setBusy(false);}}
  };
  const update=(sourceId,reading)=>setData(previous=>previous?.storeId===storeId?{...previous,sources:previous.sources.map(source=>source.sourceId===sourceId?{...source,reading}:source)}:previous);
  const read=async sources=>{
    if(busyRef.current||data?.storeId!==storeId||!sources.length||sources.length>maxSelectedAttachments||!sources.every(canRead))return;
    const ownStore=storeId,generation=data.generation,id=++sequence.current;
    const current=()=>id===sequence.current&&selectedStore.current===ownStore;
    busyRef.current=true;setBusy(true);setError('');
    try{
      for(const source of sources){
        if(!current())return;
        try{
          const result=await api(`/api/cash-papers/stores/${encodeURIComponent(ownStore)}/read`,{method:'POST',body:JSON.stringify({messageId:source.references[0].messageId,checksum:source.checksum,generation})});
          if(!current())return;
          if(result?.storeId!==ownStore||result.checksum!==source.checksum||result.generation!==generation)throw Error('Η κατάσταση άλλαξε. Πάτησε Ανανέωση.');
          update(source.sourceId,result);
          setSelected(previous=>previous.filter(sourceId=>sourceId!==source.sourceId));
          if(result.status!=='EXTRACTED_UNVERIFIED'){
            setError('Η ανάγνωση χρειάζεται έλεγχο. Η σειρά σταμάτησε σε αυτό το συνημμένο.');
            return;
          }
        }catch(e){
          if(current()){
            update(source.sourceId,{status:'REQUIRES_REVIEW'});
            setSelected(previous=>previous.filter(sourceId=>sourceId!==source.sourceId));
            setError((e.message||'Δεν επιβεβαιώθηκε η ανάγνωση.')+' Πάτησε Ανανέωση για να ελέγξεις το προηγούμενο αίτημα.');
          }
          return;
        }
      }
    }finally{if(current()){busyRef.current=false;setBusy(false);}}
  };
  const selectedSources=(data?.sources||[]).filter(source=>selected.includes(source.sourceId)&&canRead(source));
  const toggle=()=>{if(opened){sequence.current++;busyRef.current=false;setBusy(false);setOpened(false);setData(null);setSelected([]);}else{setOpened(true);load();}};
  return <section className="cash-paper-reading" aria-label="Χειρόγραφα καταστήματος">
    <button type="button" onClick={toggle} aria-expanded={opened}>Χειρόγραφα καταστήματος</button>
    {opened&&<div><button type="button" onClick={load} disabled={busy}>Ανανέωση χειρόγραφων</button>
      {busy&&<p role="status">Αναμονή αποτελέσματος…</p>}{error&&<p role="alert">{error}</p>}
      {data?.storeId===storeId&&<><p>Η προηγούμενη ολοκληρωμένη ανάγνωση επαναχρησιμοποιείται. Η ημερομηνία ανεβάσματος δεν είναι ημερομηνία του χαρτιού.</p>
        {data.status==='LIMITED'&&<p>Εμφανίζονται μόνο τα πρόσφατα συνημμένα. Η κάλυψη παραμένει περιορισμένη.</p>}
        {data.status==='UNAVAILABLE'?<p role="alert">Δεν είναι διαθέσιμη η αναζήτηση συνημμένων. Ανανέωσε τα στοιχεία.</p>:!data.sources?.length&&<p>Δεν βρέθηκαν συνημμένα στην πρόσφατη αναζήτηση.</p>}
        {!!(data.sources||[]).some(canRead)&&<><p>Επίλεξε έως {maxSelectedAttachments} συνημμένα που αφορούν την αναφορά. Η ανάγνωση γίνεται διαδοχικά με AI. Μετά άνοιξε νέα προεπισκόπηση της αναφοράς.</p><button type="button" disabled={busy||!selectedSources.length} onClick={()=>read(selectedSources)}>Ανάγνωση επιλεγμένων ({selectedSources.length})</button></>}
        {(data.sources||[]).map(source=>{const reading=source.reading||{},extraction=reading.extraction;return <article key={source.sourceId}>
          <h4>{source.references?.[0]?.filename||'Συνημμένο'}</h4><small>Μήνυμα {source.references?.[0]?.messageId}</small>
          <p>{labels[reading.status]||'Δεν επιβεβαιώθηκε η κατάσταση ανάγνωσης'}</p>
          {canRead(source)&&<label><input type="checkbox" checked={selected.includes(source.sourceId)} disabled={busy||(!selected.includes(source.sourceId)&&selected.length>=maxSelectedAttachments)} onChange={event=>{const checked=event.target.checked;setSelected(previous=>checked?[...previous,source.sourceId]:previous.filter(sourceId=>sourceId!==source.sourceId));}}/> Επιλογή για ανάγνωση</label>}
          <button type="button" disabled={busy||!canRead(source)} onClick={()=>read([source])}>Ανάγνωση με AI</button>
          {reading.status==='EXTRACTED_UNVERIFIED'&&extraction&&<div>
            <p>Ημερομηνία που διαβάστηκε: {extraction.documentDate||extraction.dateText||'δεν διαβάστηκε καθαρά'} · Όνομα: {extraction.operatorText||'δεν διαβάστηκε καθαρά'} · Βάρδια: {extraction.shiftText||'δεν διαβάστηκε καθαρά'}.</p>
            {(extraction.lines||[]).map((line,index)=><p key={index}><strong>{line.label}</strong>: {line.amountText??'δεν διαβάστηκε καθαρά'}{line.quantityText?` · ποσότητα ${line.quantityText}`:''}{line.timeText?` · ώρα ${line.timeText}`:''}{line.requiresReview?' — ΠΡΟΣ ΕΛΕΓΧΟ':''}</p>)}
            {(extraction.notes||[]).map((note,index)=><p key={`note:${index}`}>{note}</p>)}
            <p>Η ανάγνωση παραμένει προς αντιστοίχιση με βάρδια.</p>
          </div>}
        </article>;})}
      </>}
    </div>}
  </section>;
}
