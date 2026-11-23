import React,{useEffect,useRef,useState} from "react";

const branchPath="/api/commerce/documents/mydata/branch";
const branchText=value=>value===null?"":String(value);
const toBranch=value=>value===""?null:Number(value);
const isBranch=value=>value===null||Number.isInteger(value)&&value>=0&&value<=2147483647;

export default function MyDataBranchSettings({api,storeId}){
  const requestScope=useRef(null);
  const saving=useRef(false);
  const [loaded,setLoaded]=useState(null);
  const [value,setValue]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const confirmResult=result=>{
    if(result?.storeId!==storeId||!isBranch(result.branch))throw new Error("Δεν επιβεβαιώθηκε η αντιστοίχιση του καταστήματος.");
    return result.branch;
  };

  useEffect(()=>{
    const scope={api,storeId,controller:new AbortController()};
    requestScope.current=scope;
    saving.current=false;
    setLoaded(null);
    setBusy(false);
    setError("");
    setNotice("");
    api(`${branchPath}?${new URLSearchParams({storeId})}`,{signal:scope.controller.signal})
      .then(result=>{
        if(requestScope.current!==scope)return;
        const branch=confirmResult(result);
        setValue(branchText(branch));
        setLoaded({scope,branch});
      })
      .catch(cause=>{if(requestScope.current===scope)setError(cause.message)});
    return ()=>{
      requestScope.current=null;
      scope.controller.abort();
    };
  },[api,storeId,refresh]);

  const scope=loaded?.scope;
  const current=scope&&requestScope.current===scope&&scope.api===api&&scope.storeId===storeId;
  const candidate=toBranch(value);
  const valid=(value===""||/^\d+$/.test(value))&&isBranch(candidate);
  async function save(event){
    event.preventDefault();
    if(!current||saving.current||!valid||candidate===loaded.branch)return;
    saving.current=true;
    setBusy(true);
    setError("");
    setNotice("");
    try{
      const result=await api(branchPath,{
        method:"PUT",
        body:JSON.stringify({storeId,branch:candidate,expectedBranch:loaded.branch}),
        signal:scope.controller.signal
      });
      if(requestScope.current!==scope)return;
      const branch=confirmResult(result);
      if(branch!==candidate)throw new Error("Η αλλαγή της αντιστοίχισης δεν επιβεβαιώθηκε.");
      setLoaded({scope,branch});
      setValue(branchText(branch));
      setNotice("Η αντιστοίχιση myDATA αποθηκεύτηκε.");
    }catch(cause){
      if(requestScope.current===scope){
        setError(cause.message);
        if(cause.code==="MYDATA_BRANCH_STALE")setLoaded(null);
      }
    }finally{
      if(requestScope.current===scope){saving.current=false;setBusy(false)}
    }
  }

  return <details className="commerce-box">
    <summary>Αντιστοίχιση εγκατάστασης myDATA</summary>
    <p>Χρησιμοποίησε τον κωδικό εγκατάστασης παραλήπτη όπως δηλώνεται στο myDATA. Το 0 είναι έγκυρος κωδικός. Κενό πεδίο αφαιρεί την αντιστοίχιση.</p>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {current?<form onSubmit={save}>
      <label>Κωδικός εγκατάστασης <input value={value} onChange={event=>setValue(event.target.value)} inputMode="numeric" maxLength={10} disabled={busy}/></label>
      <button type="submit" disabled={busy||!valid||candidate===loaded.branch}>{busy?"Αποθήκευση…":"Αποθήκευση αντιστοίχισης"}</button>
    </form>:error?<button type="button" onClick={()=>setRefresh(age=>age+1)}>Ανανέωση αντιστοίχισης</button>:<p role="status">Φόρτωση αντιστοίχισης…</p>}
  </details>;
}
