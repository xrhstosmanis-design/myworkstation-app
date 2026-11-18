import React,{useEffect,useRef,useState} from "react";

export default function NetlinkConnectionForm({companyId,storeId,request}){
  const url=`/api/platform/companies/${encodeURIComponent(companyId)}/stores/${encodeURIComponent(storeId)}/netlink-connection`;
  return <ConnectionForm key={url} url={url} request={request}/>;
}

function ConnectionForm({url,request}){
  const [connection,setConnection]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[result,setResult]=useState(null);
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[stationId,setStationId]=useState("");
  const alive=useRef(false),inFlight=useRef(false);
  useEffect(()=>{
    alive.current=true;
    request(url).then(data=>{if(alive.current){setConnection(data.connection);setStationId(data.connection?.stationId||"")}}).catch(err=>{if(alive.current)setError(err.message)}).finally(()=>{if(alive.current)setLoading(false)});
    return()=>{alive.current=false};
  },[url]);
  const run=async(action,options)=>{
    if(inFlight.current||loading)return;
    inFlight.current=true;setBusy(action);setError("");setResult(null);
    try{
      const data=await request(action==="SAVE"?url:`${url}/${action==="CHECK"?"check":"status"}`,options);
      if(!alive.current)return;
      if(action==="CHECK")setResult(data);
      else{setConnection(data.connection);setUsername("");setPassword("");setStationId(data.connection?.stationId||"")}
    }catch(err){if(alive.current)setError(err.message)}finally{inFlight.current=false;if(alive.current)setBusy("")}
  };
  return <form onSubmit={event=>{event.preventDefault();run("SAVE",{method:"PUT",body:JSON.stringify({username,password,stationId,enabled:connection?.configured?connection.enabled:false})})}}>
    <div className="fiscal-integration-heading"><div><h3>Netlink Airtime</h3><span>{loading?"Φόρτωση…":connection?.configured?`${connection.enabled?"ΡΥΘΜΙΣΜΕΝΗ":"ΑΝΕΝΕΡΓΗ"} · Station ${connection.stationId}`:"ΔΕΝ ΕΧΕΙ ΡΥΘΜΙΣΤΕΙ"}</span></div></div>
    <p>Χρησιμοποίησε τα υπάρχοντα στοιχεία Netlink αυτού του καταστήματος.</p>
    {error&&<div role="alert" className="platform-error">{error}</div>}
    <label>Station ID<input name="netlinkStationId" value={stationId} onChange={e=>setStationId(e.target.value)} autoComplete="off" maxLength={160} required disabled={loading||Boolean(busy)}/></label>
    <label>Όνομα χρήστη Netlink<input name="netlinkUsername" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="off" maxLength={300} required disabled={loading||Boolean(busy)}/></label>
    <label>Κωδικός Netlink<input name="netlinkPassword" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" maxLength={2000} required disabled={loading||Boolean(busy)}/></label>
    <small>Τα στοιχεία αποθηκεύονται κρυπτογραφημένα μόνο για αυτό το κατάστημα. Η νέα σύνδεση παραμένει ανενεργή μέχρι να την ενεργοποιήσεις. Για αντικατάσταση συμπλήρωσε ξανά όνομα χρήστη και κωδικό.</small>
    <div className="platform-form-actions">
      <button disabled={loading||Boolean(busy)}>{busy==="SAVE"?"Αποθήκευση…":"Ασφαλής αποθήκευση Netlink"}</button>
      <button type="button" className="secondary" disabled={loading||Boolean(busy)||!connection?.configured} onClick={()=>run("CHECK",{method:"POST",body:"{}"})}>{busy==="CHECK"?"Έλεγχος…":"Έλεγχος πρόσβασης χωρίς έκδοση"}</button>
      {connection?.configured&&<button type="button" className="secondary" disabled={loading||Boolean(busy)} onClick={()=>run("STATUS",{method:"PATCH",body:JSON.stringify({enabled:!connection.enabled})})}>{connection.enabled?"Απενεργοποίηση Netlink":"Ενεργοποίηση σύνδεσης Netlink"}</button>}
    </div>
    {result&&<div role="status" className="terminal-explainer">{result.message}</div>}
    <small>Η αποθήκευση και ο έλεγχος πρόσβασης δεν εκδίδουν κάρτα και δεν επιβεβαιώνουν την ταυτότητα του καταστήματος. Η τελική ταυτοποίηση γίνεται με αναφορά της Netlink.</small>
  </form>;
}
