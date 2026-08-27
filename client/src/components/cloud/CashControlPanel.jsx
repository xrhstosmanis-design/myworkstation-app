import React,{useEffect,useMemo,useState} from "react";
import {CheckCircle2,Coins,RefreshCw,ShieldCheck,TrendingDown,TrendingUp,WalletCards} from "lucide-react";
import "./cash-control.css";

const number=value=>Number(value||0);
const money=value=>number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR"):"—";
const initialAmounts={drawer:"0",custody:"0",coins:"0",safe:"0"};
const findingLabels={CASH_SHORTAGE:"Έλλειμμα μετρητών",CASH_SURPLUS:"Πλεόνασμα μετρητών",POS_EFTPOS_DIFFERENCE:"Διαφορά POS–EFTPOS",EXPENSE_WITHOUT_DOCUMENT:"Έξοδο χωρίς παραστατικό",REVERSED_TRANSACTION:"Αντιλογισμένη συναλλαγή",ACTION_AFTER_SHIFT_CLOSE:"Ακύρωση ή επιστροφή μετά το κλείσιμο",ACTION_WITHOUT_ORIGINAL_SALE:"Ενέργεια χωρίς αρχική πώληση",MULTIPLE_ACTIONS_ON_SAME_SALE:"Πολλαπλές ενέργειες στην ίδια πώληση",ACTION_BY_DIFFERENT_OPERATOR:"Ενέργεια από διαφορετικό χειριστή",AMOUNT_MATCHES_CASH_DIFFERENCE:"Ποσό που ταιριάζει με τη διαφορά",REPEATED_AUDIT_AMOUNT:"Επαναλαμβανόμενο ποσό στα συμβάντα"};
const findingLabel=code=>findingLabels[code]||String(code||"").replace(/^AUDIT_/,"Συμβάν: ").replaceAll("_"," ");

export default function CashControlPanel({api,store}){
  const [data,setData]=useState(null);
  const [daily,setDaily]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [eftposReview,setEftposReview]=useState(null);
  const [investigation,setInvestigation]=useState(null);
  const [openForm,setOpenForm]=useState({shiftLabel:"Πρωινή βάρδια",...initialAmounts,note:""});
  const [closeForm,setCloseForm]=useState({cashSales:"0",cardSales:"0",eftposTotal:"0",expenses:"0",transferIn:"0",transferOut:"0",...initialAmounts,note:""});

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const [result,dailyResult]=await Promise.all([api(`/api/cash/stores/${store.id}/overview`),api(`/api/cash/stores/${store.id}/daily-summary`)]);
      setData(result);
      setDaily(dailyResult);
      if(!result.openSession){
        const suggested=result.suggestedOpening||{};
        setOpenForm(form=>({...form,
          drawer:String(suggested.drawer||0),custody:String(suggested.custody||0),
          coins:String(suggested.coins||0),safe:String(suggested.safe||0)
        }));
      }else{
        let ledgerSummary=null;
        try{
          const ledger=await api(`/api/transactions/stores/${store.id}/overview`);
          ledgerSummary=ledger.summary||null;
        }catch{}
        setCloseForm(form=>({...form,
          cashSales:String(ledgerSummary?.cashSales??form.cashSales??0),
          cardSales:String(ledgerSummary?.cardSales??form.cardSales??0),
          expenses:String(ledgerSummary?.expensesTotal??form.expenses??0),
          transferIn:String(ledgerSummary?.transferIn??form.transferIn??0),
          transferOut:String(ledgerSummary?.transferOut??form.transferOut??0),
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
  const expectedOpening=number(data?.suggestedOpening?.operational);
  const openingVariance=openingOperational-expectedOpening;
  const closingOperational=useMemo(()=>number(closeForm.drawer)+number(closeForm.custody)+number(closeForm.coins),[closeForm]);
  const expectedOperational=useMemo(()=>{
    const opening=number(data?.openSession?.openingOperational);
    return opening+number(closeForm.cashSales)+number(closeForm.transferIn)-number(closeForm.transferOut)-number(closeForm.expenses);
  },[data,closeForm.cashSales,closeForm.transferIn,closeForm.transferOut,closeForm.expenses]);
  const variance=closingOperational-expectedOperational;
  const lastClosed=(data?.recent||[]).find(row=>row.status==="CLOSED");

  const updateOpen=(key,value)=>setOpenForm(form=>({...form,[key]:value}));
  const updateClose=(key,value)=>setCloseForm(form=>({...form,[key]:value}));
  const investigate=async sessionId=>{setBusy(true);setError("");try{setInvestigation(await api(`/api/cash/sessions/${sessionId}/investigation`))}catch(err){setError(err.message)}finally{setBusy(false)}};
  const addReview=async decision=>{if(!investigation)return;let amount=0;if(decision==="EXPLANATION"){const entered=window.prompt("Ποσό που εξηγείται (€):",Math.abs(number(investigation.unexplainedVariance)).toFixed(2));if(entered===null)return;amount=number(String(entered).replace(",","."));if(amount<=0)return setError("Γράψε θετικό ποσό εξήγησης.")}const note=String(window.prompt(decision==="CONFIRMED_SHORTAGE"?"Υποχρεωτική αιτιολογία οριστικοποίησης ελλείμματος:":"Υποχρεωτικό σχόλιο ελέγχου:","")||"").trim();if(note.length<5)return setError("Το σχόλιο πρέπει να έχει τουλάχιστον 5 χαρακτήρες.");setBusy(true);setError("");try{await api(`/api/cash/sessions/${investigation.session.id}/reviews`,{method:"POST",body:JSON.stringify({decision,amount,note})});await investigate(investigation.session.id)}catch(err){setError(err.message)}finally{setBusy(false)}};

  const openShift=async event=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");setEftposReview(null);
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
        cashSales:number(closeForm.cashSales),cardSales:number(closeForm.cardSales),eftposTotal:number(closeForm.eftposTotal),expenses:number(closeForm.expenses),
        drawer:number(closeForm.drawer),custody:number(closeForm.custody),coins:number(closeForm.coins),
        safe:number(closeForm.safe),note:closeForm.note
      })});
      setMessage(`Η βάρδια έκλεισε. Διαφορά: ${money(result.variance)}. Έναρξη επόμενης: ${money(result.nextOpeningTotal)}.`);
      if(result.emailNotification?.status==="SENT")setMessage(`Η βάρδια έκλεισε και η αναφορά στάλθηκε με email. Διαφορά: ${money(result.variance)}. Έναρξη επόμενης: ${money(result.nextOpeningTotal)}.`);
      if(result.emailNotification?.status==="FAILED")setError("Η βάρδια έκλεισε κανονικά, αλλά το email αναφοράς δεν στάλθηκε. Ενημέρωσε τον διαχειριστή.");
      setEftposReview(result);
      setCloseForm({cashSales:"0",cardSales:"0",eftposTotal:"0",expenses:"0",transferIn:"0",transferOut:"0",...initialAmounts,note:""});await load();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  return <article className="cloud-panel cash-module">
    <div className="cloud-panel-head cash-heading">
      <div><h3><WalletCards/>Αυτόματος Έλεγχος Ταμείων</h3><p>Αυτόματη διασταύρωση βαρδιών, POS–EFTPOS, εξόδων και παραστατικών. Η έναρξη βάρδιας γίνεται μόνο από το POS / Store Mode.</p></div>
      <button className="cash-refresh" onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button>
    </div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {message&&<div className="cloud-alert cloud-success">{message}</div>}
    {eftposReview&&Math.abs(number(eftposReview.cardVariance))>0.009&&<div className="cloud-alert cloud-error cash-eftpos-review">
      <b>Έλεγχος POS–EFTPOS: διαφορά {money(eftposReview.cardVariance)}</b>
      <span>POS {money(eftposReview.cardSales)} · EFTPOS {money(eftposReview.eftposTotal)}. Δεν έγινε αυτόματη ακύρωση ή αλλαγή συναλλαγής.</span>
      {(eftposReview.duplicateReview||[]).length>0?<><strong>Πιθανές διαδοχικές ίδιες συναλλαγές:</strong>{eftposReview.duplicateReview.map(match=><span key={`${match.firstSaleId}-${match.secondSaleId}`}>{when(match.firstAt)} → {when(match.secondAt)} · {money(match.total)} · {match.products.join(", ")}</span>)}</>:<span>Δεν βρέθηκαν δύο ίδιες συναλλαγές η μία αμέσως μετά την άλλη μέσα στη βάρδια.</span>}
    </div>}
    {loading?<div className="cloud-loading">Φόρτωση ελέγχου ταμείου…</div>:<>
      <section className={`cash-daily-summary ${daily?.status==="NEEDS_REVIEW"?"needs-review":"agreement"}`}>
        <div><span>ΣΗΜΕΡΙΝΟΣ ΑΥΤΟΜΑΤΟΣ ΕΛΕΓΧΟΣ</span><strong>{daily?.status==="NEEDS_REVIEW"?"ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ":"ΣΥΜΦΩΝΙΑ"}</strong><small>{daily?.sessions?.length||0} κλεισμένες βάρδιες · {daily?.rule?.mode==="DIFFERENCE_ONLY"?"κανόνας: μόνο Διαφορά και POS–EFTPOS":"όλα τα POS"}</small></div>
        <div><span>Έλλειμμα</span><strong className="cash-negative">{money(daily?.totals?.shortage)}</strong></div>
        <div><span>Πλεόνασμα</span><strong className="cash-positive">{money(daily?.totals?.surplus)}</strong></div>
        <div><span>POS–EFTPOS</span><strong className={Math.abs(number(daily?.totals?.cardVariance))>0.009?"cash-negative":"cash-positive"}>{money(daily?.totals?.cardVariance)}</strong></div>
        <div><span>Έξοδα χωρίς σωστό παραστατικό</span><strong>{(daily?.expenseChecks||[]).filter(row=>row.status!=="MATCHED").length}</strong></div>
        <div><span>Πιθανές διπλές</span><strong>{daily?.totals?.duplicateCandidates||0}</strong></div>
      </section>
      <div className="cash-metrics">
        <article><span>Κατάσταση</span><strong className={data?.openSession?"cash-open":"cash-closed"}>{data?.openSession?"ΑΝΟΙΧΤΗ":"ΚΛΕΙΣΤΗ"}</strong></article>
        <article><span>Λειτουργικό ποσό</span><strong>{money(data?.openSession?.openingOperational||data?.suggestedOpening?.operational)}</strong></article>
        <article><span>Χρηματοκιβώτιο</span><strong>{money(data?.openSession?.openingSafe||data?.suggestedOpening?.safe)}</strong></article>
        <article><span>Τελευταία διαφορά</span><strong className={number(lastClosed?.variance)<0?"cash-negative":"cash-positive"}>{lastClosed?money(lastClosed.variance):"—"}</strong></article>
      </div>

      {!data?.openSession?<div className="cloud-empty">
        <b>Η βάρδια είναι κλειστή.</b><br/>
        Η έναρξη βάρδιας δεν επιτρέπεται από το BackOffice. Ανοίγει μόνο από το POS / Store Mode από τον χειριστή του καταστήματος.
      </div>:<form className="cash-form" onSubmit={closeShift}>
        <div className="cash-open-summary"><div><span>{data.openSession.shiftLabel}</span><strong>Άνοιξε {when(data.openSession.openedAt)}</strong><small>Από: {data.openSession.openedByName||"Μη καταγεγραμμένος χρήστης"}</small></div><div><span>Έναρξη</span><strong>{money(data.openSession.openingOperational)}</strong></div></div>
        <div className="cash-form-title"><WalletCards/><div><h4>Κλείσιμο βάρδιας</h4><p>Τα σύνολα μετρητών, καρτών, μεταφορών και εξόδων συμπληρώνονται αυτόματα από τις Συναλλαγές Βάρδιας και παραμένουν διαθέσιμα για τελικό έλεγχο.</p></div></div>
        <MoneyField icon={<TrendingUp/>} label="Πωλήσεις μετρητών" value={closeForm.cashSales} onChange={value=>updateClose("cashSales",value)} readOnly/>
        <MoneyField icon={<TrendingUp/>} label="Πωλήσεις καρτών" value={closeForm.cardSales} onChange={value=>updateClose("cardSales",value)} readOnly/>
        <MoneyField icon={<WalletCards/>} label="Σύνολο EFTPOS" value={closeForm.eftposTotal} onChange={value=>updateClose("eftposTotal",value)}/>
        <MoneyField icon={<TrendingUp/>} label="Μεταφορές προς βάρδια" value={closeForm.transferIn} onChange={value=>updateClose("transferIn",value)} readOnly/>
        <MoneyField icon={<TrendingDown/>} label="Μεταφορές από βάρδια" value={closeForm.transferOut} onChange={value=>updateClose("transferOut",value)} readOnly/>
        <MoneyField icon={<TrendingDown/>} label="Έξοδα / πληρωμές" value={closeForm.expenses} onChange={value=>updateClose("expenses",value)} readOnly/>
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
          <div><span>Διαφορά έναρξης</span><b className={number(row.openingVariance)<0?"cash-negative":"cash-positive"}>{money(row.openingVariance)}</b></div>
          <div><span>Μετρητά</span><b>{money(row.cashSales)}</b></div>
          <div><span>Κάρτες</span><b>{money(row.cardSales)}</b></div>
          <div><span>EFTPOS</span><b>{row.status==="CLOSED"?money(row.eftposTotal):"—"}</b></div>
          <div><span>Διαφορά</span><b className={number(row.variance)<0?"cash-negative":"cash-positive"}>{row.status==="CLOSED"?money(row.variance):"—"}</b></div>
          {row.status==="CLOSED"&&<button type="button" className="cash-investigate" onClick={()=>investigate(row.id)} disabled={busy}>Πλήρης έλεγχος</button>}
        </div>)}</div>}
      </div>
      {investigation&&<section className="cash-investigation"><header><div><span>ΔΙΕΡΕΥΝΗΣΗ ΒΑΡΔΙΑΣ</span><h4>{investigation.session.shiftLabel} · {investigation.session.terminalPos||"MAIN"}</h4></div><button type="button" onClick={()=>setInvestigation(null)}>Κλείσιμο</button></header>{investigation.recheckRequired&&<div className="cloud-alert cloud-error"><b>ΑΠΑΙΤΕΙΤΑΙ ΕΠΑΝΕΛΕΓΧΟΣ</b><br/>Προστέθηκε ή άλλαξε κίνηση, έξοδο, παραστατικό ή αντιλογισμός μετά τον προηγούμενο έλεγχο. Οι παλιές εξηγήσεις διατηρούνται στο ιστορικό αλλά δεν μειώνουν πλέον τη διαφορά.</div>}<div className="cash-investigation-totals"><span>Αρχική διαφορά <b>{money(investigation.initialVariance)}</b></span><span>POS–EFTPOS <b>{money(investigation.cardVariance)}</b></span><span>Τελική ανεξήγητη διαφορά <b>{money(investigation.unexplainedVariance)}</b></span></div><p>{investigation.rule}</p><div className="cash-review-actions"><button type="button" onClick={()=>addReview("EXPLANATION")} disabled={busy}>Καταχώριση εξήγησης</button>{number(investigation.unexplainedVariance)<-0.009&&<button type="button" className="danger" onClick={()=>addReview("CONFIRMED_SHORTAGE")} disabled={busy}>Οριστικοποίηση ελλείμματος</button>}</div>{(investigation.reviews||[]).length>0&&<div className="cash-reviews"><h4>Έλεγχος και επανέλεγχος</h4>{investigation.reviews.map(row=><article key={row.id}><b>{row.decision==="EXPLANATION"?`Εξήγηση ${money(row.amount)}`:row.decision==="CONFIRMED_SHORTAGE"?"Οριστικοποιημένο έλλειμμα":"Επανέλεγχος χωρίς αλλαγή"}</b><span>{row.note}</span><small>Ελέγχθηκε από {row.actorName} · {when(row.createdAt)}</small></article>)}</div>}{investigation.findings.length===0?<div className="cloud-empty">Δεν βρέθηκε ύποπτη κίνηση ή συμβάν.</div>:<div className="cash-findings">{investigation.findings.map((finding,index)=><article key={`${finding.code}-${index}`}><span className={finding.severity==="HIGH"?"high":"medium"}>{finding.severity==="HIGH"?"ΥΨΗΛΗ":"ΜΕΣΑΙΑ"}</span><b>{findingLabel(finding.code)}</b><small>{finding.actorName||"Σύστημα"}{finding.at?` · ${when(finding.at)}`:""}</small>{finding.amount!=null&&<strong>{money(finding.amount)}</strong>}{finding.reason&&<em>{finding.reason}</em>}</article>)}</div>}</section>}
    </>}
  </article>;
}

function MoneyField({icon,label,value,onChange,readOnly=false}){
  return <label className="cash-money-field"><span>{icon}{label}</span><div><input type="number" min="0" max="999999999" step="0.01" value={value} readOnly={readOnly} aria-readonly={readOnly} onChange={event=>onChange(event.target.value)}/><small>€</small></div></label>;
}
