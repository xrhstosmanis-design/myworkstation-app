import React,{useEffect,useMemo,useRef,useState} from "react";
import {Armchair,Map as MapIcon,Plus,Settings2,Users,X} from "lucide-react";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const blankTable={name:"",areaId:"",capacity:4,shape:"SQUARE"};
const shapeLabel={SQUARE:"Τετράγωνο",ROUND:"Στρογγυλό",RECTANGLE:"Ορθογώνιο"};

function WaiterAssignment({api,storeId,order,onSaved,disabled}){
  const [operators,setOperators]=useState(null);
  const [operatorId,setOperatorId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const open=async()=>{
    setBusy(true);
    setError("");
    try {
      const result=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/table-service/waiters`);
      setOperators(result.operators.filter(operator=>operator.id!==order.operatorId));
    } catch(failure){setError(failure.message)}
    finally{setBusy(false)}
  };
  const save=async event=>{
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/table-orders/${encodeURIComponent(order.id)}/waiter`,{
        method:"PATCH",body:JSON.stringify({operatorId,expectedOperatorId:order.operatorId}),
      });
      setOperators(null);
      setOperatorId("");
      await onSaved();
    } catch(failure){setError(failure.message)}
    finally{setBusy(false)}
  };
  return <div>
    {operators===null?<button type="button" disabled={busy||disabled} onClick={open}>ΑΛΛΑΓΗ ΣΕΡΒΙΤΟΡΟΥ</button>:
      <form onSubmit={save}>
        <label>Νέος σερβιτόρος <select value={operatorId} disabled={busy||disabled} onChange={event=>setOperatorId(event.target.value)}>
          <option value="">Επίλεξε χειριστή</option>
          {operators.map(operator=><option key={operator.id} value={operator.id}>{operator.displayName}</option>)}
        </select></label>
        {!operators.length&&<p>Δεν υπάρχουν άλλοι διαθέσιμοι χειριστές.</p>}
        <button type="submit" disabled={busy||disabled||!operatorId}>ΑΠΟΘΗΚΕΥΣΗ ΣΕΡΒΙΤΟΡΟΥ</button>
        <button type="button" disabled={busy||disabled} onClick={()=>{setOperators(null);setOperatorId("");setError("")}}>ΚΛΕΙΣΙΜΟ</button>
      </form>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}


const operationLabel={MOVE:"Μεταφορά",MERGE:"Ένωση",SPLIT:"Διαίρεση"};

function TableRestructure({api,storeId,order,tables,orders,disabled,onBusyChange,onSaved}){
  const [operation,setOperation]=useState("");
  const [targetTableId,setTargetTableId]=useState("");
  const [lineIds,setLineIds]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const submitting=useRef(false);
  const attempt=useRef({payload:null,key:null});
  const items=(order.items||[]).filter(item=>Number(item.quantity)>0);
  const occupied=new Map(orders.map(value=>[value.tableId,value]));
  const targets=tables.filter(table=>table.id!==order.tableId&&
    (operation==="MERGE"?occupied.has(table.id):!occupied.has(table.id)));
  const paid=Number(order.tablePaidCents||0)>0;
  const payload={operation,targetTableId,...(operation==="SPLIT"?{lineIds:[...lineIds].sort()}:{})};
  const fingerprint=JSON.stringify(payload);
  const retrying=attempt.current.payload===fingerprint;
  const targetValid=retrying||targets.some(table=>table.id===targetTableId&&
    (operation!=="MERGE"||Number(occupied.get(table.id)?.tablePaidCents||0)===0));
  const selectedTotal=items.filter(item=>lineIds.includes(item.id)).reduce((total,item)=>total+Number(item.lineTotal||0),0);
  const selectOperation=value=>{
    setOperation(value);
    setTargetTableId("");
    setLineIds([]);
    setError("");
  };
  const save=async event=>{
    event.preventDefault();
    if(submitting.current||disabled||!targetValid)return;
    if(operation==="SPLIT"&&!retrying&&(!lineIds.length||lineIds.length>=items.length)){
      setError("Επίλεξε γραμμές για το νέο τραπέζι και άφησε τουλάχιστον μία στο αρχικό.");
      return;
    }
    if(attempt.current.payload!==fingerprint)attempt.current={payload:fingerprint,key:crypto.randomUUID()};
    submitting.current=true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const result=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/table-orders/${encodeURIComponent(order.id)}/restructure`,{
        method:"POST",body:JSON.stringify({...payload,idempotencyKey:attempt.current.key}),
      });
      selectOperation("");
      attempt.current={payload:null,key:null};
      await onSaved(result);
    } catch(failure){
      setError(`${failure.message} Ανανέωσε τα τραπέζια για να ελέγξεις το αποτέλεσμα. Αν επαναλάβεις τα ίδια στοιχεία εδώ, χρησιμοποιείται το ίδιο αναγνωριστικό ενέργειας.`);
    } finally {
      submitting.current=false;
      setBusy(false);
      onBusyChange(false);
    }
  };
  return <div style={{flexBasis:"100%",minWidth:0}}>
    {!operation?<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button type="button" disabled={disabled} onClick={()=>selectOperation("MOVE")}>ΜΕΤΑΦΟΡΑ</button>
      <button type="button" disabled={disabled||paid} onClick={()=>selectOperation("MERGE")}>ΕΝΩΣΗ</button>
      <button type="button" disabled={disabled||paid||items.length<2} onClick={()=>selectOperation("SPLIT")}>ΔΙΑΙΡΕΣΗ</button>
      {paid&&<small>Έχει καταγραφεί πληρωμή. Διατίθεται μεταφορά ολόκληρου λογαριασμού.</small>}
    </div>:<form onSubmit={save} aria-label={`${operationLabel[operation]} ${order.tableName}`} style={{display:"grid",gap:10,padding:12,border:"1px solid #cbd5e1",borderRadius:12,background:"#f8fafc"}}>
      <strong>{operationLabel[operation]} · {order.tableName}</strong>
      <label>Τραπέζι προορισμού
        <select value={targetTableId} disabled={busy} required onChange={event=>setTargetTableId(event.target.value)} style={{display:"block",width:"100%",minHeight:44}}>
          <option value="">Επίλεξε {operation==="MERGE"?"κατειλημμένο":"ελεύθερο"} τραπέζι</option>
          {retrying&&!targets.some(table=>table.id===targetTableId)&&<option value={targetTableId}>{tables.find(table=>table.id===targetTableId)?.name||"Τραπέζι προορισμού"} · επαλήθευση προηγούμενης ενέργειας</option>}
          {targets.map(table=><option key={table.id} value={table.id} disabled={operation==="MERGE"&&Number(occupied.get(table.id)?.tablePaidCents||0)>0}>
            {table.name}{operation==="MERGE"?` · ${euro(occupied.get(table.id).total)}${Number(occupied.get(table.id).tablePaidCents||0)>0?" · έχει πληρωμή":""}`:""}
          </option>)}
        </select>
      </label>
      {!targets.length&&<p role="status">Δεν υπάρχει διαθέσιμο {operation==="MERGE"?"κατειλημμένο":"ελεύθερο"} τραπέζι προορισμού.</p>}
      {retrying&&<p role="status">Επαλήθευση της ίδιας ενέργειας. Η επανάληψη χρησιμοποιεί το αρχικό αναγνωριστικό.</p>}
      {operation==="SPLIT"&&!retrying&&<fieldset disabled={busy} style={{display:"grid",gap:8,minWidth:0}}>
        <legend>Γραμμές για το νέο τραπέζι</legend>
        {items.map(item=><label key={item.id} style={{display:"flex",gap:8,alignItems:"center",minHeight:44}}>
          <input type="checkbox" checked={lineIds.includes(item.id)} onChange={event=>setLineIds(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>
          <span>Γ{item.roundNumber||1} · {item.quantity} × {item.name} · {euro(item.lineTotal)}{item.notes&&<small style={{display:"block"}}>{item.notes}</small>}</span>
        </label>)}
        <small>Μεταφέρεται όλη η ποσότητα κάθε επιλεγμένης γραμμής. Αφήνεις τουλάχιστον μία γραμμή στο αρχικό τραπέζι.</small>
        <strong>Νέο τραπέζι {euro(selectedTotal)} · Αρχικό {euro(Number(order.total)-selectedTotal)}</strong>
      </fieldset>}
      {operation==="MERGE"&&!retrying&&targetTableId&&occupied.has(targetTableId)&&<p>Ενιαίος λογαριασμός στο {targets.find(table=>table.id===targetTableId)?.name} · {euro(Number(order.total)+Number(occupied.get(targetTableId).total))}</p>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="submit" className="pos-primary-action" disabled={busy||disabled||!targetValid||(operation==="SPLIT"&&!retrying&&(!lineIds.length||lineIds.length>=items.length))}>{busy?"Αποθήκευση…":"ΕΠΙΒΕΒΑΙΩΣΗ"}</button>
        <button type="button" disabled={busy} onClick={()=>selectOperation("")}>ΑΚΥΡΟ</button>
      </div>
    </form>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}

export default function StoreTableOrdersModal({api,store,cart,onClose,onLoad,onCartCleared,setError,setMessage}){
  const operationBusy=useRef(false);
  const [restructuring,setRestructuring]=useState(false);
  const [data,setData]=useState({areas:[],tables:[],orders:[],canConfigure:false}),[tableId,setTableId]=useState(""),[areaId,setAreaId]=useState("ALL"),[busy,setBusy]=useState(false),[configuring,setConfiguring]=useState(false),[newTable,setNewTable]=useState(blankTable);
  const load=async(force=false)=>{if(operationBusy.current&&!force)return;setBusy(true);try{const result=await api(`/api/store-pos/stores/${store.id}/table-service`);setData(result);setTableId(current=>result.tables?.some(table=>table.id===current)?current:result.tables?.[0]?.id||"")}catch(error){setError(error.message)}finally{setBusy(false)}};
  useEffect(()=>{load();const timer=setInterval(()=>load(),10000);return()=>clearInterval(timer)},[store.id]);
  const openOrders=useMemo(()=>new Map((data.orders||[]).map(order=>[order.tableId,order])),[data.orders]);
  const visibleTables=(data.tables||[]).filter(table=>areaId==="ALL"?true:areaId==="NONE"?!table.areaId:table.areaId===areaId);  const selectedOrder=openOrders.get(tableId);
  const addArea=async()=>{const name=String(window.prompt("Όνομα σάλας ή ζώνης:","")||"").trim();if(!name)return;setBusy(true);try{const area=await api(`/api/store-pos/stores/${store.id}/table-service/areas`,{method:"POST",body:JSON.stringify({name})});setAreaId(area.id);setMessage(`Δημιουργήθηκε η σάλα «${name}».`);await load()}catch(error){setError(error.message)}finally{setBusy(false)}};
  const addTable=async event=>{event.preventDefault();if(!newTable.name.trim())return setError("Συμπλήρωσε όνομα ή αριθμό τραπεζιού.");setBusy(true);try{const table=await api(`/api/store-pos/stores/${store.id}/tables`,{method:"POST",body:JSON.stringify({...newTable,name:newTable.name.trim(),areaId:newTable.areaId||null})});setTableId(table.id);setAreaId(table.areaId||"NONE");setNewTable(blankTable);setConfiguring(false);setMessage(`Δημιουργήθηκε το τραπέζι «${table.name}» για ${table.capacity} άτομα.`);await load()}catch(error){setError(error.message)}finally{setBusy(false)}};
  const send=async()=>{if(!tableId||!cart.length)return setError("Επίλεξε τραπέζι και πρόσθεσε προϊόντα.");setBusy(true);try{const result=await api(`/api/store-pos/stores/${store.id}/table-orders`,{method:"POST",body:JSON.stringify({tableId,items:cart.map(item=>({productId:item.id,quantity:item.quantity,notes:item.preparation?.note||null,allergens:item.preparation?.allergens||[],modifiers:item.preparation?.modifiers||[]}))})});onCartCleared();const stations=(result.preparationBatches||[]).map(batch=>batch.productionStation).join(", ");setMessage(`${result.roundNumber>1?`Ο γύρος ${result.roundNumber} προστέθηκε`:"Η παραγγελία στάλθηκε"} στο ${result.tableName} · Νέα είδη ${euro(result.addedTotal)} · Σύνολο λογαριασμού ${euro(result.total)}${stations?` · Παρασκευή: ${stations}`:" · Δεν περιέχει είδη παρασκευής"}.`);await load()}catch(error){setError(error.message)}finally{setBusy(false)}};
  const restructureSaved=async result=>{
    setMessage(`${operationLabel[result.operation]} τραπεζιού ολοκληρώθηκε.`);
    setTableId(result.targetTableId);
    await load(true);
  };
  const restructureBusy=value=>{operationBusy.current=value;setRestructuring(value)};
  const useOrder=order=>{onLoad(order);onClose()};
  const status=async(order,next)=>{const reason=next==="CANCELLED"?String(window.prompt("Υποχρεωτική αιτιολογία ακύρωσης:","")||"").trim():null;if(next==="CANCELLED"&&!reason)return setError("Η ακύρωση απαιτεί αιτιολογία.");setBusy(true);try{await api(`/api/store-pos/stores/${store.id}/table-orders/${order.id}/status`,{method:"PATCH",body:JSON.stringify({status:next,reason})});await load()}catch(error){setError(error.message)}finally{setBusy(false)}};
  const wasteAll=async order=>{if(!window.confirm(`Να καταχωριστεί ΟΛΟ το ${order.tableName} ως φύρα ${euro(order.total)} χωρίς απόδειξη;`))return;const note=String(window.prompt("Υποχρεωτική αιτιολογία φύρας ολόκληρου τραπεζιού:","")||"").trim();if(!note)return setError("Η φύρα ολόκληρου τραπεζιού απαιτεί αιτιολογία.");setBusy(true);try{const result=await api(`/api/store-pos/stores/${store.id}/table-orders/${order.id}/waste`,{method:"POST",body:JSON.stringify({items:(order.items||[]).map(item=>({productId:item.productId,quantity:item.quantity})),note})});setMessage(`Ολόκληρο το ${result.tableName} καταχωρίστηκε ως φύρα ${euro(result.total)} · στον τζίρο χωρίς απόδειξη.`);await load()}catch(error){setError(error.message)}finally{setBusy(false)}};
  return <div className="pos-standard-modal" onMouseDown={event=>event.target===event.currentTarget&&!busy&&!restructuring&&onClose()}><section role="dialog" aria-modal="true" aria-label="Σάλες, τραπέζια και παραγγελίες"><header><div><small>ΑΣΥΡΜΑΤΗ ΠΑΡΑΓΓΕΛΙΟΛΗΨΙΑ</small><h2>Σάλες, τραπέζια και παραγγελίες</h2></div><button type="button" aria-label="Κλείσιμο τραπεζιών" disabled={busy||restructuring} onClick={onClose}><X/></button></header><main>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14}}><MapIcon size={20}/><button type="button" disabled={busy||restructuring} onClick={()=>load()}>Ανανέωση</button><button onClick={()=>setAreaId("ALL")} className={areaId==="ALL"?"pos-primary-action":""}>Όλες οι σάλες</button>{(data.areas||[]).map(area=><button key={area.id} onClick={()=>setAreaId(area.id)} className={areaId===area.id?"pos-primary-action":""}>{area.name}</button>)}{(data.tables||[]).some(table=>!table.areaId)&&<button onClick={()=>setAreaId("NONE")} className={areaId==="NONE"?"pos-primary-action":""}>Χωρίς σάλα</button>}{data.canConfigure&&<><button onClick={addArea} disabled={busy||restructuring}><Plus size={16}/> Νέα σάλα</button><button onClick={()=>setConfiguring(value=>!value)} disabled={busy||restructuring}><Settings2 size={16}/> Νέο τραπέζι</button></>}</div>
    {configuring&&<form onSubmit={addTable} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,padding:12,marginBottom:14,border:"1px solid #cbd5e1",borderRadius:12,background:"#f8fafc"}}><input aria-label="Όνομα τραπεζιού" placeholder="Τραπέζι 1" value={newTable.name} onChange={event=>setNewTable({...newTable,name:event.target.value})}/><select aria-label="Σάλα" value={newTable.areaId} onChange={event=>setNewTable({...newTable,areaId:event.target.value})}><option value="">Χωρίς σάλα</option>{(data.areas||[]).map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select><input aria-label="Χωρητικότητα" type="number" min="1" max="100" value={newTable.capacity} onChange={event=>setNewTable({...newTable,capacity:event.target.value})}/><select aria-label="Σχήμα" value={newTable.shape} onChange={event=>setNewTable({...newTable,shape:event.target.value})}>{Object.entries(shapeLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="pos-primary-action" disabled={busy||restructuring}>ΑΠΟΘΗΚΕΥΣΗ</button></form>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:12,marginBottom:16}}>{visibleTables.map(table=>{const order=openOrders.get(table.id),ready=order?.status==="READY",selected=tableId===table.id;return <button key={table.id} onClick={()=>setTableId(table.id)} style={{minHeight:105,padding:12,borderRadius:table.shape==="ROUND"?"50%":table.shape==="RECTANGLE"?"10px":"18px",border:selected?"4px solid #0f766e":"2px solid #cbd5e1",background:ready?"#bbf7d0":order?"#fef3c7":"#f8fafc",color:"#143c34",fontWeight:900,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}><Armchair size={22}/><span>{table.name}</span><small><Users size={13}/> {table.capacity} άτομα · {shapeLabel[table.shape]||table.shape}</small><small>{ready?"ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΑΒΗ":order?`${order.operatorName||"Χειριστής"} · ${euro(order.total)}`:"ΕΛΕΥΘΕΡΟ"}</small></button>})}</div>
    {!visibleTables.length&&<p style={{padding:18,textAlign:"center",background:"#f8fafc",borderRadius:12}}>Δεν υπάρχουν τραπέζια σε αυτή τη σάλα.</p>}
    <button className="pos-primary-action" disabled={busy||restructuring||!tableId||!cart.length} onClick={send}>{selectedOrder?"ΠΡΟΣΘΗΚΗ ΝΕΟΥ ΓΥΡΟΥ":"ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ"} ({cart.length} είδη)</button>
    <div className="pos-hold-list" style={{marginTop:18}}>{data.orders.map(order=><article key={order.id} style={order.status==="READY"?{border:"3px solid #087a52",background:"#ecfdf5"}:undefined}><div><b>{order.tableName} · {euro(order.total)} {order.status==="READY"&&<span style={{color:"#087a52"}}>· ΕΤΟΙΜΗ ΓΙΑ ΠΑΡΑΛΑΒΗ</span>}</b><small style={{display:"block"}}>{order.operatorName||"Χειριστής"} · {order.status} · {(order.items||[]).map(item=>`Γ${item.roundNumber||1}: ${item.quantity}× ${item.name}`).join(" · ")}</small></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button disabled={busy||restructuring} onClick={()=>useOrder(order)}>ΦΟΡΤΩΣΗ ΣΤΟ POS</button>{data.canConfigure&&<WaiterAssignment key={order.operatorId} api={api} storeId={store.id} order={order} disabled={busy||restructuring} onSaved={load}/>}<button disabled={busy||restructuring} onClick={()=>wasteAll(order)} style={{background:"#d97706"}}>ΦΥΡΑ ΟΛΟ ΤΟ ΤΡΑΠΕΖΙ</button><button disabled={busy||restructuring} onClick={()=>status(order,"CANCELLED")}>ΑΚΥΡΩΣΗ</button>{data.canConfigure&&<TableRestructure api={api} storeId={store.id} order={order} tables={data.tables||[]} orders={data.orders} disabled={busy||restructuring} onBusyChange={restructureBusy} onSaved={restructureSaved}/>}</div></article>)}</div>
  </main></section></div>;
}
