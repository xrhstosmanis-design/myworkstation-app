import React,{useEffect,useMemo,useState} from "react";
import {CheckCircle2,Coins,RefreshCw,ShieldCheck,TrendingDown,TrendingUp,WalletCards} from "lucide-react";
import "./cash-control.css";

const number=value=>Number(value||0);
const money=value=>number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR"):"—";
const initialAmounts={drawer:"0",custody:"0",coins:"0",safe:"0"};

export default function CashControlPanel({api,store}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [openForm,setOpenForm]=useState({shiftLabel:"Πρωινή βάρδια",...initialAmounts,note:""});
  const [closeForm,setCloseForm]=useState({cashSales:"0",cardSales:"0",expenses:"0",...initialAmounts,note:""});

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const result=await api(`/api/cash/stores/${store.id}/overview`);
      setData(result);
      if(!result.openSession){
        const suggested=result.suggestedOpening||{};
        setOpenForm(form=>({...form,
          drawer:String(suggested.drawer||0),custody:String(suggested.custody||0),
          coins:String(suggested.coins||0),safe:String(suggested.safe||0)
        }));
      }else{
        setCloseForm(form=>({...form,
          drawer:String(result.openSession.openingDrawer||0),
          custody:String(result.openSession.openingCustody||0),
          coins:String(result.openSession.openingCoins||0),
          safe:String(result.openSession.openingSafe||0)
        }));
      }
    }catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id]);

  const openingOperational=useMemo(()=>number(openForm.drawer)+number(openForm.custody)+number(openForm.coins),[openForm]);
  const closingOperational=useMemo(()=>number(closeForm.drawer)+number(closeForm.custody)+number(closeForm.coins),[closeForm]);
  const expectedOperational=useMemo(()=>{
    const opening=number(data?.openSession?.openingOperational);
    return opening+number(closeForm.cashSales)-number(closeForm.expenses);
  },[data,closeForm.cashSales,closeForm.expenses]);
  const variance=closingOperational-expectedOperational;
  const lastClosed=(data?.recent||[]).find(row=>row.status==="CLOSED");

  const updateOpen=(key,value)=>setOpenForm(form=>({...form,[key]:value}));
  const updateClose=(key,value)=>setCloseForm(form=>({...form,[key]:value}));

  const openShift=async event=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      await api(`/api/cash/stores/${store.id}/sessions/open`,{method:"POST",body:JSON.stringify({
        shiftLabel:openForm.shiftLabel,drawer:number(openForm.drawer),custody:number(openForm.custody),
        coins:number(openForm.coins),safe:number(openForm.safe),note:openForm.note
      })});
      setMessage("Η βάρδια άνοιξε και καταγράφηκε ονομαστικά.");await load();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const closeShift=async event=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const result=await api(`/api/cash/sessions/${data.openSession.id}/close`,{method:"POST",body:JSON.stringify({
        cashSales:number(closeForm.cashSales),cardSales:number(closeForm.cardSales),expenses:number(closeForm.expenses),
        drawer:number(closeForm.drawer),custody:number(closeForm.custody),coins:number(closeForm.coins),
        safe:number(closeForm.safe),note:closeForm.note
      })});
      setMessage(`Η βάρδια έκλεισε. Διαφορά: ${money(result.variance)}. Έναρξη επόμενης: ${money(result.nextOpeningTotal)}.`);
      setCloseForm({cashSales:"0",cardSales:"0",expenses:"0",...initialAmounts,note:""});await load();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  return <article className="cloud-panel cash-module">
    <div className="cloud-panel-head cash-heading">
      <div><h3><WalletCards/>Έλεγχος Ταμείου</h3><p>Άνοιγμα και κλείσιμο βάρδιας με Συρτάρι, Φύλαξη, Κέρματα και Χρηματοκιβώτιο.</p></div>
      <button className="cash-refresh" onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button>
    </div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {message&&<div className="cloud-alert cloud-success">{message}</div>}
    {loading?<div className="cloud-loading">Φόρτωση ελέγχου ταμείου…</div>:<>
      <div className="cash-metrics">
        <article><span>Κατάσταση</span><strong className={data?.openSession?"cash-open":"cash-closed"}>{data?.openSession?"ΑΝΟΙΧΤΗ":"ΚΛΕΙΣΤΗ"}</strong></article>
        <article><span>Λειτουργικό ποσό</span><strong>{money(data?.openSession?.openingOperational||data?.suggestedOpening?.operational)}</strong></article>
        <article><span>Χρηματοκιβώτιο</span><strong>{money(data?.openSession?.openingSafe||data?.suggestedOpening?.safe)}</strong></article>
        <article><span>Τελευταία διαφορά</span><strong className={number(lastClosed?.variance)<0?"cash-negative":"cash-positive"}>{lastClosed?money(lastClosed.variance):"—"}</strong></article>
      </div>

      {!data?.openSession?<form className="cash-form" onSubmit={openShift}>
        <div className="cash-form-title"><CheckCircle2/><div><h4>Άνοιγμα βάρδιας</h4><p>Το σύνολο έναρξης υπολογίζεται από Συρτάρι + Φύλαξη + Κέρματα. Το χρηματοκιβώτιο είναι ενημερωτικό.</p></div></div>
        <label className="cash-wide">Ονομασία βάρδιας<input value={openForm.shiftLabel} onChange={e=>updateOpen("shiftLabel",e.target.value)} required/></label>
        <MoneyField icon={<WalletCards/>} label="Συρτάρι" value={openForm.drawer} onChange={value=>updateOpen("drawer",value)}/>
        <MoneyField icon={<ShieldCheck/>} label="Φύλαξη" value={openForm.custody} onChange={value=>updateOpen("custody",value)}/>
        <MoneyField icon={<Coins/>} label="Κέρματα" value={openForm.coins} onChange={value=>updateOpen("coins",value)}/>
        <MoneyField icon={<ShieldCheck/>} label="Χρηματοκιβώτιο" value={openForm.safe} onChange={value=>updateOpen("safe",value)}/>
        <label className="cash-wide">Σημείωση<input value={openForm.note} onChange={e=>updateOpen("note",e.target.value)} placeholder="Προαιρετική σημείωση παράδοσης"/></label>
        <div className="cash-total"><span>Έναρξη επόμενης λειτουργίας</span><strong>{money(openingOperational)}</strong></div>
        <button className="cash-submit" disabled={busy}>{busy?"Αποθήκευση…":"Άνοιγμα βάρδιας"}</button>
      </form>:<form className="cash-form" onSubmit={closeShift}>
        <div className="cash-open-summary"><div><span>{data.openSession.shiftLabel}</span><strong>Άνοιξε {when(data.openSession.openedAt)}</strong><small>Από: {data.openSession.openedByName||"Μη καταγεγραμμένος χρήστης"}</small></div><div><span>Έναρξη</span><strong>{money(data.openSession.openingOperational)}</strong></div></div>
        <div className="cash-form-title"><WalletCards/><div><h4>Κλείσιμο βάρδιας</h4><p>Καταχώρισε τζίρο, έξοδα και τα πραγματικά ποσά που παραδίδονται.</p></div></div>
        <MoneyField icon={<TrendingUp/>} label="Πωλήσεις μετρητών" value={closeForm.cashSales} onChange={value=>updateClose("cashSales",value)}/>
        <MoneyField icon={<TrendingUp/>} label="Πωλήσεις καρτών" value={closeForm.cardSales} onChange={value=>updateClose("cardSales",value)}/>
        <MoneyField icon={<TrendingDown/>} label="Έξοδα / πληρωμές" value={closeForm.expenses} onChange={value=>updateClose("expenses",value)}/>
        <div className="cash-divider cash-wide">Πραγματική καταμέτρηση παράδοσης</div>
        <MoneyField icon={<WalletCards/>} label="Συρτάρι" value={closeForm.drawer} onChange={value=>updateClose("drawer",value)}/>
        <MoneyField icon={<ShieldCheck/>} label="Φύλαξη" value={closeForm.custody} onChange={value=>updateClose("custody",value)}/>
        <MoneyField icon={<Coins/>} label="Κέρματα" value={closeForm.coins} onChange={value=>updateClose("coins",value)}/>
        <MoneyField icon={<ShieldCheck/>} label="Χρηματοκιβώτιο" value={closeForm.safe} onChange={value=>updateClose("safe",value)}/>
        <label className="cash-wide">Εκκρεμότητες επόμενης βάρδιας<input value={closeForm.note} onChange={e=>updateClose("note",e.target.value)} placeholder="Μήνυμα παράδοσης"/></label>
        <div className="cash-calculation cash-wide">
          <div><span>Αναμενόμενο</span><strong>{money(expectedOperational)}</strong></div>
          <div><span>Πραγματικό</span><strong>{money(closingOperational)}</strong></div>
          <div><span>Διαφορά</span><strong className={variance<0?"cash-negative":"cash-positive"}>{money(variance)}</strong></div>
          <div><span>Έναρξη επόμενης</span><strong>{money(closingOperational)}</strong></div>
        </div>
        <button className="cash-submit" disabled={busy}>{busy?"Κλείσιμο…":"Κλείσιμο και παράδοση"}</button>
      </form>}

      <div className="cash-history">
        <h4>Πρόσφατες βάρδιες</h4>
        {(data?.recent||[]).length===0?<div className="cloud-empty">Δεν υπάρχουν ακόμη καταχωρίσεις ταμείου.</div>:<div className="cash-history-list">{data.recent.map(row=><div className="cash-history-row" key={row.id}>
          <div><b>{row.shiftLabel}</b><small>{when(row.openedAt)} · {row.openedByName||"Χρήστης"}{row.closedByName?` → ${row.closedByName}`:""}</small></div>
          <span className={`status-pill ${row.status==="OPEN"?"active":"revoked"}`}>{row.status==="OPEN"?"ΑΝΟΙΧΤΗ":"ΚΛΕΙΣΤΗ"}</span>
          <div><span>Έναρξη</span><b>{money(row.openingOperational)}</b></div>
          <div><span>Μετρητά</span><b>{money(row.cashSales)}</b></div>
          <div><span>Κάρτες</span><b>{money(row.cardSales)}</b></div>
          <div><span>Διαφορά</span><b className={number(row.variance)<0?"cash-negative":"cash-positive"}>{row.status==="CLOSED"?money(row.variance):"—"}</b></div>
        </div>)}</div>}
      </div>
    </>}
  </article>;
}

function MoneyField({icon,label,value,onChange}){
  return <label className="cash-money-field"><span>{icon}{label}</span><div><input type="number" min="0" max="999999999" step="0.01" value={value} onChange={event=>onChange(event.target.value)}/><small>€</small></div></label>;
}
