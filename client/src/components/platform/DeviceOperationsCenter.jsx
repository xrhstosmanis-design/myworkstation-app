import React,{useEffect,useState} from "react";
import {Activity,MonitorUp,RefreshCw,RotateCcw,X} from "lucide-react";
import "./device-operations.css";

export default function DeviceOperationsCenter({manager,request,initialOpen=false,onLaunch}){
  const[open,setOpen]=useState(initialOpen);
  const[health,setHealth]=useState(null);
  const[jobs,setJobs]=useState([]);
  const[error,setError]=useState("");
  const[remote,setRemote]=useState(null);
  const base=`/api/platform/device-operations/companies/${manager.company.id}/stores/${manager.store.id}`;

  const load=async()=>{
    setError("");
    try{
      const[healthResult,jobsResult]=await Promise.all([request(`${base}/device-health`),request(`${base}/deployments`)]);
      setHealth(healthResult);setJobs(jobsResult.jobs||[]);
    }catch(e){setError(e.message)}
  };
  useEffect(()=>{if(open)load()},[open]);

  const launch=()=>{onLaunch?.();setOpen(true)};
  const plan=async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    try{
      const result=await request(`${base}/deployments`,{method:"POST",body:JSON.stringify({terminalId:form.get("terminalId")||null,jobType:form.get("jobType"),targetRevision:form.get("targetRevision")||null,notes:form.get("notes")||""})});
      if(result.supportCode)setRemote(result);
      event.currentTarget.reset();await load();
    }catch(e){setError(e.message)}
  };

  return <>
    <button type="button" className="device-ops-launch" onClick={launch}><Activity/>Installation Center</button>
    {open&&<div className="platform-modal device-ops-modal"><section>
      <button className="modal-close" onClick={()=>setOpen(false)}><X/></button>
      <header><div><h2>Super Admin Installation Center</h2><p>{manager.company.name} · {manager.store.name}</p></div><button onClick={load}><RefreshCw/>Ανανέωση</button></header>
      {error&&<div className="op-alert error">{error}</div>}
      {remote&&<div className="op-alert remote-code"><b>REMOTE · Κωδικός {remote.supportCode}</b><a href={remote.acceptancePath} target="_blank" rel="noreferrer">Άνοιγμα οθόνης αποδοχής</a><span>Ισχύει 10 λεπτά. Ο χρήστης πρέπει να τον αποδεχτεί στον συγκεκριμένο υπολογιστή.</span></div>}
      <div className="device-health-grid">{(health?.devices||[]).map(device=><article className={String(device.health).toLowerCase()} key={device.id}><Activity/><div><b>{device.terminalPos} · {device.displayName}</b><span>{device.health} · {device.appRevision||"Άγνωστη έκδοση"}</span><small>Τελευταία σύνδεση: {device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString("el-GR"):"ποτέ"}</small></div></article>)}</div>
      <form className="device-job-form" onSubmit={plan}><h3>REMOTE / ασφαλής εργασία</h3><select name="terminalId"><option value="">Όλα τα τερματικά</option>{manager.terminals.filter(row=>row.active).map(terminal=><option key={terminal.id} value={terminal.id}>{terminal.terminalPos} · {terminal.displayName}</option>)}</select><select name="jobType"><option value="REMOTE_ASSIST">REMOTE — δωρεάν υποστήριξη</option><option value="REMOTE_INSTALL">Απομακρυσμένη εγκατάσταση</option><option value="APP_UPDATE">Ενημέρωση εφαρμογής</option><option value="RECOVERY_DRY_RUN">Recovery dry-run</option></select><input name="targetRevision" placeholder="Έκδοση / revision"/><input name="notes" placeholder="Σημειώσεις"/><button><MonitorUp/>Έναρξη / Προγραμματισμός</button><small>Το REMOTE είναι δωρεάν για όλα τα καταστήματα. Απαιτείται αποδοχή στο PC. Δεν αποστέλλονται εντολές σε RBS/EFTPOS/fiscal provider.</small></form>
      <h3>Ιστορικό εργασιών</h3><div className="device-job-list">{jobs.map(job=><article key={job.id}><RotateCcw/><div><b>{job.jobType} · {job.terminalPos||"ΟΛΑ"}</b><span>{job.status} · {job.targetRevision||"χωρίς revision"}</span><small>{new Date(job.createdAt).toLocaleString("el-GR")}</small></div></article>)}</div>
    </section></div>}
  </>;
}
