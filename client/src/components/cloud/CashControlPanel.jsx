import React,{useEffect,useMemo,useState} from "react";
import {BriefcaseBusiness,CheckCircle2,Coins,RefreshCw,ShieldCheck,TrendingDown,TrendingUp,WalletCards} from "lucide-react";
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
  const [closeForm,setCloseForm]=useState({cashSales:"0",cardSales:"0",eftposTotal:"0",expenses:"0",transferIn:"0",...initialAmounts,note:""});

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
    return opening+number(closeForm.cashSales)+number(closeForm.transferIn)-number(closeForm.expenses);
  },[data,closeForm.cashSales,closeForm.transferIn,closeForm.expenses]);
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
      setCloseForm({cashSales:"0",cardSales:"0",eftposTotal:"0",expenses:"0",transferIn:"0",...initialAmounts,note:""});await load();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  return <article className="cloud-panel cash-module">
    <div className="cloud-panel-head cash-heading">
      <div><h3><WalletCards/>Αυτόματος Έλεγχος Ταμείων</h3><p>Αυτόματη διασταύρωση βαρδιών, POS–EFTPOS, εξόδων και παραστατικών. Η έναρξη βάρδιας γίνεται μόνο από το POS / Store Mode.</p></div>
      <div className="cash-heading-actions">
        <button className="cash-refresh" type="button" onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button>
        <button className="cash-refresh" type="button" onClick={()=>window.dispatchEvent(new Event("mws:commerce-open"))}><BriefcaseBusiness/>Εμπορική λειτουργία</button>
      </div>
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
      <section className={`cash-daily-summary ${(data?.offlineSync?.counts?.pending||data?.offlineSync?.counts?.failed)?"needs-review":"agreement"}`} data-offline-sync-evidence="true">
        <div><span>OFFLINE ΣΥΓΧΡΟΝΙΣΜΟΣ</span><strong>{(data?.offlineSync?.counts?.pending||data?.offlineSync?.counts?.failed)?"ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ":"ΣΥΜΦΩΝΙΑ"}</strong><small>Αμετάβλητο audit ανά transaction ID</small></div>
        <div><span>Αναμονή</span><strong>{data?.offlineSync?.counts?.pending||0}</strong></div>
        <div><span>Αποτυχίες</span><strong className={data?.offlineSync?.counts?.failed?"cash-negative":"cash-positive"}>{data?.offlineSync?.counts?.failed||0}</strong></div>
        <div><span>Συγχρονίστηκαν</span><strong className="cash-positive">{data?.offlineSync?.counts?.synced||0}</strong></div>
        <div><span>Idempotent replay</span><strong>{data?.offlineSync?.counts?.replays||0}</strong></div>
      </section>
      <section className={`cash-daily-summary ${daily?.reconciliation?.status==="AGREEMENT"?"agreement":"needs-review"}`} data-kat-reconciliation="true">
        <div><span>KAT RECONCILIATION 52-57</span><strong>{daily?.reconciliation?.status==="AGREEMENT"?"ΣΥΜΦΩΝΙΑ":"ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ"}</strong><small>Order / Sale / Fiscal / EFTPOS / Stock και κλείσιμο ανά terminal</small><small>{(daily?.sessions||[]).map(row=>`${row.closedByName||row.openedByName||"Χωρίς χειριστή"} · ${row.terminalPos||"MAIN"} · ${row.shiftLabel||"Βάρδια"}`).join(" | ")||"Δεν υπάρχει κλεισμένη βάρδια"}</small></div>
        <div><span>Store</span><strong>{money(daily?.reconciliation?.totals?.store)}</strong></div>
        <div><span>Delivery</span><strong>{money(daily?.reconciliation?.totals?.delivery)}</strong></div>
        <div><span>Online</span><strong>{money(daily?.reconciliation?.totals?.online)}</strong></div>
        <div><span>Cash / Cards</span><strong>{money(daily?.reconciliation?.totals?.cash)} / {money(daily?.reconciliation?.totals?.cards)}</strong></div>
        <div><span>Returns / Voids</span><strong>{money(daily?.reconciliation?.totals?.returns)} / {money(daily?.reconciliation?.totals?.voids)}</strong></div>
        <div><span>Pending fiscalizations</span><strong className={daily?.reconciliation?.totals?.pendingFiscalizations?"cash-negative":"cash-positive"}>{daily?.reconciliation?.totals?.pendingFiscalizations||0}</strong></div>
        <div><span>Fail-closed alerts</span><strong className={(daily?.reconciliation?.issues||[]).length?"cash-negative":"cash-positive"}>{(daily?.reconciliation?.issues||[]).length}</strong></div>
        <div><span>EFTPOS ανά συσκευή</span><strong>{Object.entries(daily?.reconciliation?.totals?.eftposByDevice||{}).map(([device,total])=>`${device}: ${money(total)}`).join(" · ")||"—"}</strong></div>
      </section>
      {(data?.offlineSync?.rows||[]).length>0&&<div className="cash-history"><h4>Offline συναλλαγές</h4><div className="cash-history-list">{data.offlineSync.rows.slice(0,10).map(row=><div className="cash-history-row" key={row.clientTransactionId}><div><b>{row.status} · {String(row.clientTransactionId).slice(0,8)}</b><small>{when(row.lastReportedAt)} · προσπάθειες {row.attempts}{row.idempotentReplay?" · DUPLICATE/REPLAY":""}</small></div><span className={`status-pill ${row.status==="SYNCED"?"active":"revoked"}`}>{row.status}</span><div><span>Sale</span><b>{row.saleId||"—"}</b></div><div><span>Σφάλμα</span><b>{row.lastErrorCode||"—"}</b></div></div>)}</div></div>}
      <div className="cloud-alert"><b>Οι βάρδιες ανοίγουν και κλείνουν αποκλειστικά από το POS / Store Mode.</b><br/>Το BackOffice εμφανίζει μόνο τον αυτόματο έλεγχο, τη συμφωνία και τις αποκλίσεις.</div>
    </>}
  </article>;
}
