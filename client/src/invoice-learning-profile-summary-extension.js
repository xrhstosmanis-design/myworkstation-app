const PROFILE_KEY="mws_invoice_learning_profile_summary_extension_v1";
const STATE_KEY="mws_invoice_learning_lab_v1";
const normalize=value=>String(value??"").normalize("NFKC").trim().toLocaleUpperCase("el-GR").replace(/\s+/g," ");
const safeCount=value=>{
  if(value==null||value==="")return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0?Math.floor(number):null;
};
const readState=()=>{
  try{
    const value=JSON.parse(localStorage.getItem(STATE_KEY)||"null");
    return value&&typeof value==="object"?value:{documents:[],profiles:{}};
  }catch{return {documents:[],profiles:{}}}
};
const profileCounts=(key,profile,documents)=>{
  const taxIds=new Set([profile.supplierTaxId,profile.taxId,/^\d{8,10}$/.test(String(key))?key:null].map(normalize).filter(Boolean));
  const names=new Set([profile.supplierName,profile.name,profile.supplier,!/^\d{8,10}$/.test(String(key))?key:null].map(normalize).filter(Boolean));
  const learned=documents.filter(document=>{
    if(document?.status!=="LEARNED")return false;
    const documentTax=normalize(document.supplierTaxId||document.taxId);
    const documentName=normalize(document.supplierName||document.supplier);
    return (documentTax&&taxIds.has(documentTax))||(documentName&&names.has(documentName));
  });
  const docs=safeCount(profile.documents);
  const lines=safeCount(profile.lines);
  return {
    documents:docs??learned.length,
    lines:lines??learned.reduce((sum,document)=>sum+(Array.isArray(document.lines)?document.lines.length:0),0),
    mappings:Object.keys(profile.mappings&&typeof profile.mappings==="object"?profile.mappings:{}).length
  };
};
const showProfiles=()=>{
  const state=readState();
  const profiles=state.profiles&&typeof state.profiles==="object"&&!Array.isArray(state.profiles)?state.profiles:{};
  const documents=Array.isArray(state.documents)?state.documents:[];
  const summary=Object.entries(profiles).map(([key,profile])=>{
    const row=profile&&typeof profile==="object"?profile:{};
    const counts=profileCounts(key,row,documents);
    return `${row.supplierName||key}: ${counts.documents} τιμολόγια / ${counts.lines} γραμμές / ${counts.mappings} mappings`;
  }).join("\n")||"Δεν υπάρχουν ακόμη προφίλ.";
  window.alert(summary);
};
if(!window[PROFILE_KEY]){
  window[PROFILE_KEY]=true;
  document.addEventListener("click",event=>{
    const button=event.target instanceof Element?event.target.closest("#profiles"):null;
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showProfiles();
  },true);
}
