import React,{useState} from "react";

const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν διαβάστηκε το αρχείο."));reader.readAsDataURL(file)});
const money=value=>Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:4});

export default function KatInvoicePreview({api,store}){
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null),[jobId,setJobId]=useState("");
  const run=async()=>{
    if(!file||busy)return;
    setBusy(true);setError("");setResult(null);setJobId("");
    try{
      const dataUrl=await readFile(file);
      const mimeType=file.type||"image/jpeg";
      if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(mimeType))throw new Error("Χρησιμοποίησε JPG, PNG, WEBP ή PDF.");
      const job=await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId:store.id,filename:file.name||"kat-invoice-test",mimeType,dataUrl,localConfidence:0,result:{rawText:"",lines:[],pageCount:null,pdfNote:"KAT isolated extraction preview"}})});
      if(!job?.id)throw new Error("Δεν δημιουργήθηκε AI Reader job.");
      setJobId(job.id);
      const ai=await api(`/api/commerce/ai-reader/jobs/${encodeURIComponent(job.id)}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});
      setResult(ai?.result||{});
    }catch(err){setError(err.message||"Η δοκιμή απέτυχε.")}
    finally{setBusy(false)}
  };
  const lines=Array.isArray(result?.productLines)?result.productLines:[];
  return <div style={{border:"2px solid #4b7f6b",borderRadius:10,padding:12,marginTop:12,background:"#f7fffb"}} data-kat-invoice-preview="true">
    <div style={{fontWeight:900,fontSize:17}}>KAT TEST — Invoice Preview</div>
    <small style={{display:"block",margin:"4px 0 10px"}}>Μόνο ανάγνωση AI. Δεν γίνεται πληρωμή, παραγγελία ή ενημέρωση stock.</small>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <label style={{fontWeight:800}}>Αρχείο <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null);setError("")}}/></label>
      <button type="button" disabled={!file||busy} onClick={run} style={{fontWeight:900}}>{busy?"Ανάγνωση AI…":"Δοκιμή ανάγνωσης"}</button>
      {file&&<b>{file.name}</b>}
    </div>
    {error&&<div style={{marginTop:10,padding:8,background:"#fff1f2",fontWeight:800}}>❌ {error}</div>}
    {result&&<div style={{marginTop:12}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(150px,1fr))",gap:8,marginBottom:10}}>
        <div><small>Προμηθευτής</small><div style={{fontWeight:800}}>{result?.supplier?.name||"—"}</div></div>
        <div><small>Παραστατικό</small><div style={{fontWeight:800}}>{result?.documentNumber||"—"}</div></div>
        <div><small>Ημερομηνία</small><div style={{fontWeight:800}}>{result?.documentDate||"—"}</div></div>
        <div><small>Σύνολο</small><div style={{fontWeight:800}}>{money(result?.totalGross)} €</div></div>
      </div>
      <div style={{fontWeight:900,marginBottom:6}}>Structured productLines: {lines.length}</div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["#","Κωδικός","Περιγραφή","Ποσότητα","Μονάδα","Τεμ./συσκ.","Τιμή","Καθαρή αξία","ΦΠΑ","Μικτή αξία","Βεβαιότητα ανάγνωσης"].map(h=><th key={h} style={{textAlign:"left",padding:6,borderBottom:"1px solid #ccd9d4"}}>{h}</th>)}</tr></thead><tbody>{lines.map((line,index)=><tr key={`${index}-${line.code||line.description||"line"}`}><td style={{padding:6}}>{index+1}</td><td style={{padding:6}}>{line.code||"—"}</td><td style={{padding:6,fontWeight:700}}>{line.description||"—"}</td><td style={{padding:6}}>{Number(line.quantity||0)}</td><td style={{padding:6}}>{line.unit||"—"}</td><td style={{padding:6}}>{Number(line.unitsPerPackage||0)}</td><td style={{padding:6}}>{money(line.unitCost)}</td><td style={{padding:6}}>{money(line.netAmount)}</td><td style={{padding:6}}>{Number(line.vatRate||0)}%</td><td style={{padding:6}}>{money(line.grossAmount)}</td><td style={{padding:6}}>{Number(line.confidence||0)}%</td></tr>)}</tbody></table></div>
      {!lines.length&&<div style={{padding:10,background:"#fff7ed",fontWeight:800}}>Το AI δεν επέστρεψε structured productLines.</div>}
      <small style={{display:"block",marginTop:8}}>Test job: {jobId}</small>
    </div>}
  </div>;
}
