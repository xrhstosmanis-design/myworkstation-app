import React,{useEffect,useState} from "react";
import {Activity,Clock3,RefreshCw} from "lucide-react";
export default function WorkforceV2EmployeePerformance({employee,base,request,onClose}){
 const[data,setData]=useState(null),[error,setError]=useState("");
 const load=()=>{setError("");request(`${base}/employees/${employee.id}/performance?days=30`).then(setData).catch(e=>setError(e.message)};
 useEffect(load,[employee.id]);
 const h=m=>`${Math.floor((m||0)/60)}ω ${(m||0)%60}λ`;
 return <section className="workforce-editor-card"><div className="workforce-card-title"><div><h4><Activity/> Απόδοση & Ταμεία · {employee.fullName}</h4><p>Πραγματικά στοιχεία 30 ημερών. Κάθε δείκτης θα παραμένει συνδεδεμένος με την πηγή του.</p></div><button className="secondary" onClick={onClose}>Κλείσιμο</button></div>{error&&<div className="platform-alert error">{error}</div>}{!data?<p><RefreshCw/> Φόρτωση…</p>:<><div className="workforce-summary-row"><div><Clock3/><b>{h(data.attendance.workedMinutes)}</b><span>πραγματική εργασία</span></div><div><b>{h(data.attendance.overtimeMinutes)}</b><span>υπερωρία</span></div><div><b>{h(data.attendance.lateMinutes)}</b><span>καθυστερήσεις</span></div><div><b>{data.attendance.needsReview}</b><span>προς έλεγχο</span></div></div><div className="workforce-choice-block"><b>Ταμεία / POS</b><p>{data.cashier.message}</p></div><div className="workforce-choice-block"><b>Αξιολογήσεις</b><p>{data.evaluations.message}</p></div></>}</section>
}
