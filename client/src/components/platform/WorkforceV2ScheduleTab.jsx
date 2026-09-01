import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,CalendarDays,CheckCircle2,ClipboardCheck,Clock3,Edit3,Plus,RefreshCw,ShieldCheck,Trash2,UsersRound} from "lucide-react";

const today=()=>new Date().toISOString().slice(0,10);
const statusText={DRAFT:"Πρόχειρο",PREVIEWED:"Προεπισκόπηση",APPROVED:"Εγκεκριμένο",PUBLISHED:"Δημοσιευμένο",SUPERSEDED:"Αντικαταστάθηκε"};
const leaveText={LEAVE:"Άδεια",DAY_OFF:"Ρεπό",SICKNESS:"Ασθένεια",EMERGENCY_ABSENCE:"Έκτακτη απουσία",SHIFT_CHANGE_REQUEST:"Αίτημα αλλαγής",LATE_ARRIVAL:"Καθυστέρηση",EARLY_DEPARTURE:"Πρόωρη αποχώρηση"};
const dayName=value=>new Intl.DateTimeFormat("el-GR",{weekday:"short",day:"2-digit",month:"2-digit"}).format(new Date(`${value}T12:00:00`));
const warningsFor=assignment=>Array.isArray(assignment.warningJson)?assignment.warningJson:Array.isArray(assignment.warningJson?.warnings)?assignment.warningJson.warnings:[];

export default function WorkforceV2ScheduleTab({company,store,request,data}){
  const base=`/api/platform/store-modules/companies/${company.id}/stores/${store.id}/workforce-v2`;
  const [items,setItems]=useState([]),[leaves,setLeaves]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [date,setDate]=useState(today()),[periodType,setPeriodType]=useState("WEEK"),[selected,setSelected]=useState(""),[employeeId,setEmployeeId]=useState(""),[templateId,setTemplateId]=useState(""),[slot,setSlot]=useState("1"),[note,setNote]=useState("");
  const [view,setView]=useState("DAILY"),[validation,setValidation]=useState(null),[editing,setEditing]=useState(null),[leaveForm,setLeaveForm]=useState({employeeId:"",leaveType:"DAY_OFF",startDate:today(),endDate:today(),comments:""});
  const [reasonDialog,setReasonDialog]=useState(null),[reasonText,setReasonText]=useState("");
  const selectedSchedule=useMemo(()=>items.find(item=>item.id===selected)||null,[items,selected]);
  const activeEmployees=useMemo(()=>data.employees.filter(item=>item.active),[data.employees]);
  const templates=useMemo(()=>data.shiftTemplates.filter(item=>item.active),[data.shiftTemplates]);
  const shownSchedule=selectedSchedule||items.find(item=>["DRAFT","PREVIEWED","APPROVED","PUBLISHED"].includes(item.status))||null;
  const assignments=shownSchedule?.assignments||[];
  const days=useMemo(()=>[...new Set(assignments.map(item=>item.date))].sort(),[assignments]);
  const byDay=useMemo(()=>Object.fromEntries(days.map(day=>[day,assignments.filter(item=>item.date===day)])),[assignments,days]);
  const dailyRows=byDay[date]||[];
  const requestReason=(label,onConfirm)=>{setError("");setReasonText("");setReasonDialog({label,onConfirm})};
  const confirmReason=async()=>{
    const value=reasonText.trim();
    if(!value)return setError("Γράψε υποχρεωτικά αιτιολογία πριν συνεχίσεις.");
    const action=reasonDialog?.onConfirm;setReasonDialog(null);setReasonText("");
    await action?.(value);
  };
  const canEdit=Boolean(selectedSchedule&&["DRAFT","PREVIEWED"].includes(selectedSchedule.status));

  const load=async({keepNotice=false}={})=>{
    setBusy(true);setError("");if(!keepNotice)setNotice("");
    try{
      const [s,l]=await Promise.all([request(`${base}/schedules?from=${date}`),request(`${base}/leaves?from=${date}`)]);
      setItems(s.items||[]);setLeaves(l.items||[]);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  useEffect(()=>{load()},[company.id,store.id]);
  useEffect(()=>{if(selected&&!items.some(item=>item.id===selected))setSelected("")},[items,selected]);
  const evaluate=async schedule=>{
    if(!schedule)return;
    setBusy(true);setError("");
    try{const result=await request(`${base}/schedules/${schedule.id}/validation`);setValidation({...result,scheduleId:schedule.id});setNotice("Ο έλεγχος προγράμματος ενημερώθηκε.");}
    catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const create=()=>requestReason("Αιτιολογία δημιουργίας προγράμματος",async value=>{
    setBusy(true);setError("");
    try{const result=await request(`${base}/schedules`,{method:"POST",body:JSON.stringify({periodStart:date,periodType,confirmed:true,reason:value})});setSelected(result.item.id);setNotice(result.copiedFromPublished?"Δημιουργήθηκε νέα έκδοση από το δημοσιευμένο πρόγραμμα.":"Δημιουργήθηκε πρόχειρο πρόγραμμα.");await load({keepNotice:true});}
    catch(e){setError(e.message)}finally{setBusy(false)}
  });
  const transition=(schedule,status)=>requestReason(`Αιτιολογία για ${statusText[status]}`,async value=>{
    setBusy(true);setError("");
    try{const result=await request(`${base}/schedules/${schedule.id}/transition`,{method:"POST",body:JSON.stringify({version:schedule.version,status,confirmed:true,reason:value})});setValidation({...result.validation,scheduleId:schedule.id});setNotice(`Το πρόγραμμα είναι πλέον ${statusText[status].toLowerCase()}.`);await load({keepNotice:true});}
    catch(e){setError(e.message);if(e.validation)setValidation({...e.validation,scheduleId:schedule.id});}finally{setBusy(false)}
  });
  const payload=()=>({version:selectedSchedule.version,date,employeeId,shiftTemplateId:templateId,slot:Number(slot||1),note:note.trim()||null,confirmed:true});
  const resetAssignment=()=>{setEditing(null);setEmployeeId("");setTemplateId("");setSlot("1");setNote("")};
  const assign=()=>{
    if(!canEdit||!employeeId||!templateId)return setError("Επίλεξε πρόχειρο πρόγραμμα, εργαζόμενο και πρότυπο βάρδιας.");
    requestReason(editing?"Αιτιολογία αλλαγής ανάθεσης":"Αιτιολογία ανάθεσης",async value=>{
    setBusy(true);setError("");
    try{const method=editing?"PUT":"POST",path=editing?`${base}/schedules/${selectedSchedule.id}/assignments/${editing.id}`:`${base}/schedules/${selectedSchedule.id}/assignments`;const result=await request(path,{method,body:JSON.stringify({...payload(),reason:value})});setNotice(result.warnings?.length?"Η ανάθεση καταχωρίστηκε ως «Χρειάζεται έγκριση».":"Η ανάθεση καταχωρίστηκε.");resetAssignment();await load({keepNotice:true});}
    catch(e){setError(e.message)}finally{setBusy(false)}
    });
  };
  const editAssignment=assignment=>{setEditing(assignment);setDate(assignment.date);setEmployeeId(assignment.employee?.id||"");setTemplateId(assignment.shiftTemplate.id);setSlot(String(assignment.slot));setNote(assignment.note||"");setError("");setNotice("")};
  const removeAssignment=assignment=>requestReason("Αιτιολογία αφαίρεσης ανάθεσης",async value=>{
    setBusy(true);setError("");
    try{await request(`${base}/schedules/${selectedSchedule.id}/assignments/${assignment.id}`,{method:"DELETE",body:JSON.stringify({version:selectedSchedule.version,confirmed:true,reason:value})});setNotice("Η ανάθεση αφαιρέθηκε.");await load({keepNotice:true});}
    catch(e){setError(e.message)}finally{setBusy(false)}
  });
  const approveException=assignment=>{
    const approved=assignment.warningJson?.approvedRuleCodes||[];
    const warning=warningsFor(assignment).find(item=>!approved.includes(item.ruleCode));
    if(!warning)return;
    requestReason(`Υποχρεωτική αιτιολογία έγκρισης εξαίρεσης: ${warning.message}`,async value=>{
    setBusy(true);setError("");
    try{const result=await request(`${base}/schedules/${selectedSchedule.id}/exceptions`,{method:"POST",body:JSON.stringify({assignmentId:assignment.id,ruleCode:warning.ruleCode,confirmed:true,reason:value})});setNotice(result.allApproved?"Η εξαίρεση εγκρίθηκε.":"Εγκρίθηκε ένας έλεγχος· απομένει επόμενη εξαίρεση στην ίδια ανάθεση.");await load({keepNotice:true});}
    catch(e){setError(e.message)}finally{setBusy(false)}
    });
  };
  const submitLeave=()=>{
    if(!leaveForm.employeeId)return setError("Επίλεξε εργαζόμενο για το αίτημα.");
    requestReason("Αιτιολογία αιτήματος άδειας ή ρεπό",async value=>{
    setBusy(true);setError("");
    try{await request(`${base}/leaves`,{method:"POST",body:JSON.stringify({...leaveForm,storeId:store.id,comments:leaveForm.comments.trim()||null,confirmed:true,reason:value})});setNotice("Το αίτημα καταχωρίστηκε για έγκριση.");setLeaveForm({employeeId:"",leaveType:"DAY_OFF",startDate:date,endDate:date,comments:""});await load({keepNotice:true});}
    catch(e){setError(e.message)}finally{setBusy(false)}
    });
  };
  const decideLeave=(item,status)=>requestReason(`${status==="APPROVED"?"Έγκριση":status==="REJECTED"?"Απόρριψη":"Ακύρωση"} αιτήματος`,async value=>{
    setBusy(true);setError("");
    try{await request(`${base}/leaves/${item.id}/decision`,{method:"POST",body:JSON.stringify({status,confirmed:true,reason:value})});setNotice("Το αίτημα ενημερώθηκε.");await load({keepNotice:true});}
    catch(e){setError(e.message)}finally{setBusy(false)}
  });
  const validationFor=validation?.scheduleId===shownSchedule?.id?validation:null;
  const assignedCount=assignments.filter(item=>item.employee).length;

  return <section className="workforce-v2-tab workforce-schedule-workspace">
    <div className="workforce-v2-section-title"><div><h3><CalendarDays/> Πρόγραμμα βαρδιών</h3><p>Ημερήσια και εβδομαδιαία προβολή, έλεγχοι ανάθεσης, εξαιρέσεις και έκδοση προγράμματος.</p></div><button className="secondary" onClick={()=>load()} disabled={busy}><RefreshCw/> Ανανέωση</button></div>
    {error&&<div className="platform-alert error">{error}</div>}{notice&&<div className="platform-alert success">{notice}</div>}
    {reasonDialog&&<div className="workforce-reason-backdrop" role="dialog" aria-modal="true" aria-label="Αιτιολογία και επιβεβαίωση"><div className="workforce-reason-dialog"><h4>Αιτιολογία και επιβεβαίωση</h4><p>{reasonDialog.label}. Η αιτιολογία θα καταγραφεί στο Audit.</p><label>Υποχρεωτική αιτιολογία<textarea autoFocus value={reasonText} onChange={event=>setReasonText(event.target.value)} placeholder="Γράψε την αιτιολογία της ενέργειας"/></label><div><button className="secondary" onClick={()=>setReasonDialog(null)}>Ακύρωση</button><button className="primary" onClick={confirmReason} disabled={busy}>Επιβεβαίωση</button></div></div></div>}
    <div className="workforce-schedule-controlbar"><label>Ημερομηνία<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><label>Περίοδος<select value={periodType} onChange={event=>setPeriodType(event.target.value)}><option value="WEEK">Εβδομάδα</option><option value="MONTH">Μήνας</option></select></label><button className="primary" onClick={create} disabled={busy}><Plus/> Νέο πρόχειρο πρόγραμμα</button></div>
    <div className="workforce-schedule-overview"><div><small>Επιλεγμένο πρόγραμμα</small><select value={selected} onChange={event=>{setSelected(event.target.value);setValidation(null);resetAssignment();}}><option value="">Επίλεξε πρόγραμμα</option>{items.filter(item=>item.status!=="SUPERSEDED").map(item=><option key={item.id} value={item.id}>{item.periodStart} · έκδοση {item.version} · {statusText[item.status]}</option>)}</select></div><div className="workforce-view-switch"><button className={view==="DAILY"?"active":""} onClick={()=>setView("DAILY")}>Αναλυτική ημέρας</button><button className={view==="WEEK_SUMMARY"?"active":""} onClick={()=>setView("WEEK_SUMMARY")}>Συνοπτική εβδομάδας</button><button className={view==="WEEK_DETAILED"?"active":""} onClick={()=>setView("WEEK_DETAILED")}>Αναλυτική εβδομάδας</button></div></div>
    {shownSchedule&&<><div className="workforce-schedule-metrics"><article><CalendarDays/><div><small>Περίοδος</small><b>{shownSchedule.periodStart} – {shownSchedule.periodEnd}</b></div></article><article><UsersRound/><div><small>Κάλυψη</small><b>{assignedCount}/{assignments.length} αναθέσεις</b></div></article><article><AlertTriangle/><div><small>Έλεγχοι</small><b>{validationFor?`${validationFor.errors.length} σφάλματα · ${validationFor.approvals.length} εγκρίσεις`:"Πάτησε Έλεγχος"}</b></div></article><article><CheckCircle2/><div><small>Κατάσταση</small><b>{statusText[shownSchedule.status]}</b></div></article></div>
      <div className="workforce-schedule-actions"><button className="secondary" onClick={()=>evaluate(shownSchedule)} disabled={busy}><ClipboardCheck/> Έλεγχος προγράμματος</button>{shownSchedule.status==="DRAFT"&&<button onClick={()=>transition(shownSchedule,"PREVIEWED")} disabled={busy}>Προεπισκόπηση</button>}{shownSchedule.status==="PREVIEWED"&&<button onClick={()=>transition(shownSchedule,"APPROVED")} disabled={busy}>Έγκριση</button>}{shownSchedule.status==="APPROVED"&&<button onClick={()=>transition(shownSchedule,"PUBLISHED")} disabled={busy}>Δημοσίευση</button>}<span>Έκδοση {shownSchedule.version}</span></div>
      {validationFor&&<div className="workforce-validation"><b>Αποτέλεσμα ελέγχου</b>{validationFor.findings.length?<ul>{validationFor.findings.map((item,index)=><li key={`${item.ruleCode}-${index}`} className={item.severity.toLowerCase()}><strong>{item.severity==="ERROR"?"ΣΦΑΛΜΑ":"ΧΡΕΙΑΖΕΤΑΙ ΕΓΚΡΙΣΗ"}</strong> {item.message}</li>)}</ul>:<p><CheckCircle2/> Δεν βρέθηκαν σφάλματα ή εκκρεμείς εξαιρέσεις.</p>}</div>}
      {canEdit&&<div className="workforce-assignment-editor"><div><h4>{editing?"Αλλαγή ανάθεσης":"Νέα ανάθεση βάρδιας"}</h4><p>Οι άδειες, η πρόσβαση καταστήματος και η διαθεσιμότητα μπλοκάρουν την ανάθεση. Οι εξαιρέσεις περνούν μόνο με έγκριση.</p></div><label>Εργαζόμενος<select value={employeeId} onChange={event=>setEmployeeId(event.target.value)}><option value="">Επίλεξε εργαζόμενο</option>{activeEmployees.map(item=><option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label>Πρότυπο<select value={templateId} onChange={event=>setTemplateId(event.target.value)}><option value="">Επίλεξε βάρδια</option>{templates.map(item=><option key={item.id} value={item.id}>{item.name} · {item.startTime}–{item.endTime}</option>)}</select></label><label>Θέση<input type="number" min="1" value={slot} onChange={event=>setSlot(event.target.value)}/></label><label>Παρατήρηση<input value={note} onChange={event=>setNote(event.target.value)} placeholder="προαιρετική"/></label><button onClick={assign} disabled={busy}>{editing?<Edit3/>:<Plus/>}{editing?"Αποθήκευση αλλαγής":"Ανάθεση"}</button>{editing&&<button className="secondary" onClick={resetAssignment}>Ακύρωση</button>}</div>}
      {view==="DAILY"&&<section className="workforce-daily-board"><header><div><h4>{dayName(date)}</h4><span>{dailyRows.length?`${dailyRows.length} αναθέσεις`:"Δεν υπάρχουν αναθέσεις για την ημέρα."}</span></div></header>{dailyRows.length?<div className="workforce-assignment-table">{dailyRows.map(assignment=><div key={assignment.id} className={`workforce-assignment-row ${assignment.warningState==="NEEDS_APPROVAL"?"needs-approval":""}`}><div><b>{assignment.shiftTemplate.name}</b><span>{assignment.shiftTemplate.startTime}–{assignment.shiftTemplate.endTime} · θέση {assignment.slot}</span></div><div><b>{assignment.employee?.fullName||"ΑΚΑΛΥΠΤΟ"}</b><span>{assignment.shiftTemplate.requiredRole?.name||"Χωρίς απαιτούμενο ρόλο"}</span></div><div className="workforce-assignment-state">{assignment.warningState==="NEEDS_APPROVAL"&&<em>Χρειάζεται έγκριση</em>}{assignment.warningState==="APPROVED_EXCEPTION"&&<em className="approved">Εξαίρεση εγκεκριμένη</em>}</div>{canEdit&&<div className="workforce-row-actions">{assignment.warningState==="NEEDS_APPROVAL"&&<button onClick={()=>approveException(assignment)} disabled={busy}><ShieldCheck/> Έγκριση</button>}<button className="secondary" onClick={()=>editAssignment(assignment)} disabled={busy}><Edit3/> Αλλαγή</button><button className="secondary danger" onClick={()=>removeAssignment(assignment)} disabled={busy}><Trash2/> Αφαίρεση</button></div>}</div>)}</div>:<div className="workforce-empty">Επίλεξε ημερομηνία και πρόσθεσε αναθέσεις στο πρόχειρο πρόγραμμα.</div>}</section>}
      {view==="WEEK_SUMMARY"&&<section className="workforce-week-summary">{days.map(day=><article key={day}><header><b>{dayName(day)}</b><span>{byDay[day].filter(item=>item.employee).length}/{byDay[day].length} καλυμμένες</span></header>{byDay[day].map(item=><div key={item.id}><span>{item.shiftTemplate.name}</span><b>{item.employee?.fullName||"ΑΚΑΛΥΠΤΟ"}</b></div>)}</article>)}</section>}
      {view==="WEEK_DETAILED"&&<section className="workforce-week-detail">{days.map(day=><article key={day}><h4>{dayName(day)}</h4>{byDay[day].map(item=><div key={item.id}><span>{item.shiftTemplate.startTime}–{item.shiftTemplate.endTime}</span><b>{item.shiftTemplate.name}</b><strong>{item.employee?.fullName||"ΑΚΑΛΥΠΤΟ"}</strong><small>{item.shiftTemplate.requiredRole?.name||"—"}</small></div>)}</article>)}</section>}
    </>}
    <section className="workforce-leave-panel"><div><h4><ClipboardCheck/> Άδειες, ρεπό και απουσίες</h4><p>Εγκεκριμένη άδεια ή ρεπό αποκλείει κανονική ανάθεση.</p></div><div className="workforce-leave-form"><select value={leaveForm.employeeId} onChange={event=>setLeaveForm(current=>({...current,employeeId:event.target.value}))}><option value="">Εργαζόμενος</option>{activeEmployees.map(item=><option key={item.id} value={item.id}>{item.fullName}</option>)}</select><select value={leaveForm.leaveType} onChange={event=>setLeaveForm(current=>({...current,leaveType:event.target.value}))}>{Object.entries(leaveText).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><input type="date" value={leaveForm.startDate} onChange={event=>setLeaveForm(current=>({...current,startDate:event.target.value}))}/><input type="date" value={leaveForm.endDate} onChange={event=>setLeaveForm(current=>({...current,endDate:event.target.value}))}/><button onClick={submitLeave} disabled={busy}>Καταχώριση αιτήματος</button></div><div className="workforce-leave-list">{leaves.length?leaves.map(item=><div key={item.id}><span><b>{item.employee.fullName}</b> · {leaveText[item.leaveType]||item.leaveType} · {item.startDate} έως {item.endDate}</span><em>{item.status==="REQUESTED"?"Σε αναμονή":item.status==="APPROVED"?"Εγκεκριμένο":item.status==="REJECTED"?"Απορρίφθηκε":"Ακυρώθηκε"}</em>{item.status==="REQUESTED"&&<div><button onClick={()=>decideLeave(item,"APPROVED")} disabled={busy}>Έγκριση</button><button className="secondary" onClick={()=>decideLeave(item,"REJECTED")} disabled={busy}>Απόρριψη</button><button className="secondary" onClick={()=>decideLeave(item,"CANCELLED")} disabled={busy}>Ακύρωση</button></div>}</div>):<div className="workforce-empty">Δεν υπάρχουν αιτήματα στο επιλεγμένο διάστημα.</div>}</div></section>
  </section>;
}
