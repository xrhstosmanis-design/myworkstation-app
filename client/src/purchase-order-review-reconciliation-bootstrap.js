const nativeFetch=window.fetch.bind(window);
const managerRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const TOLERANCE=0.05;
const nonProductPattern=/(ΤΙΜΟΛΟΓΙΟ|INVOICE|ΗΜΕΡΟΜΗΝΙΑ|DATE|ΩΡΑ|ΑΦΜ|ΔΟΥ|ΕΠΩΝΥΜΙΑ|ΔΙΕΥΘΥΝΣΗ|ΤΗΛ|EMAIL|URL|IBAN|ΠΕΛΑΤ|ΣΤΟΙΧΕΙΑ|ΣΥΝΟΛΟ|SUBTOTAL|TOTAL|ΠΛΗΡΩΤΕΟ|ΦΠΑ|VAT|ΕΚΠΤΩΣΗ|DISCOUNT|ΤΡΑΠΕΖ|BANK)/i;
let activeOrderId="";

const user=()=>{try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}};
const headers=()=>{const token=localStorage.getItem("token");return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}};
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2});
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

async function api(path){
  const response=await nativeFetch(path,{headers:headers()});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

function economicProduct(row){
  const text=String(row?.ocrRawText||row?.description||"").replace(/\s+/g," ").trim();
  return Boolean(text)&&!nonProductPattern.test(text)&&Number(row?.quantity||0)>0&&(Number(row?.unitCost||0)>0||Number(row?.grossAmount||0)>0);
}

function invoiceNumberFromModal(modal){
  const labels=[...modal.querySelectorAll("label")];
  const label=labels.find(x=>/Αρ\.\s*τιμολογίου|Αριθμός\s*τιμολογίου/i.test(x.textContent||""));
  const input=label?.querySelector("input")||label?.parentElement?.querySelector("input");
  if(input?.value?.trim())return input.value.trim();
  const title=modal.querySelector(".po-modal-title")?.textContent||"";
  return (title.match(/Διόρθωση\s+παραγγελίας\s+([^\s\[]+)/i)||[])[1]||"";
}

async function invoiceTotalFor(data,modal){
  const supplierId=data?.order?.supplierId;
  const invoiceNumber=invoiceNumberFromModal(modal);
  if(!supplierId||!invoiceNumber)return null;
  const detail=await api(`/api/commerce/suppliers/${encodeURIComponent(supplierId)}/detail`);
  const target=String(invoiceNumber).trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
  const purchase=(detail?.purchases||[]).find(row=>String(row.documentNumber||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"")===target);
  return purchase?Number(purchase.totalGross||0):null;
}

function repairEmptyState(panel,rows){
  if(!panel||!rows.length)return;
  const empty=[...panel.querySelectorAll("div")].find(node=>/Δεν αναγνωρίστηκε ακόμη πραγματική γραμμή προϊόντος/i.test(node.textContent||""));
  if(empty){
    empty.textContent=`✓ Αναγνωρίστηκαν ${rows.length} πραγματικές γραμμές προϊόντων.`;
    empty.style.cssText="padding:12px;border:1px solid #b8dfc4;border-radius:10px;background:#edf9f1;color:#176b32;font-weight:800";
  }
  const unresolved=rows.filter(row=>row.resolutionStatus==="UNRESOLVED").length;
  panel.dataset.unresolved=String(unresolved);
  const header=[...panel.querySelectorAll("div")].find(node=>/Όλες οι γραμμές προϊόντων ελέγχθηκαν|άλυτες γραμμές/i.test(node.textContent||"")&&node.children.length===0);
  if(header){
    header.textContent=unresolved?`${unresolved} άλυτες γραμμές`:`✓ Όλες οι ${rows.length} γραμμές προϊόντων ελέγχθηκαν`;
    header.style.color=unresolved?"#a75d00":"#14733c";
  }
}

function renderReconciliation(modal,{invoiceTotal,lineTotal,difference,withinTolerance,rowCount}){
  let box=modal.querySelector(".mws-invoice-reconciliation");
  if(!box){
    box=document.createElement("section");
    box.className="mws-invoice-reconciliation";
    const panel=modal.querySelector(".mws-ocr-resolution-panel");
    if(panel)panel.after(box);else modal.prepend(box);
  }
  const ok=withinTolerance;
  box.style.cssText=`border:2px solid ${ok?'#74b98a':'#e3a73c'};border-radius:12px;padding:11px 13px;margin:10px 0;background:${ok?'#effaf2':'#fff8e8'}`;
  box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap"><div><b>Οικονομικός έλεγχος τιμολογίου</b><div style="margin-top:5px">Σύνολο τιμολογίου: <b>${money(invoiceTotal)}</b> · Σύνολο ${rowCount} γραμμών: <b>${money(lineTotal)}</b> · Διαφορά: <b>${money(Math.abs(difference))}</b> · Ανοχή: <b>0,05 €</b></div></div><strong style="color:${ok?'#14733c':'#a75d00'}">${ok?'✓ ΣΥΜΦΩΝΕΙ':'⚠ ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ'}</strong></div>`;
}

async function inspect(orderId){
  if(!orderId||!managerRoles.has(user()?.role))return;
  const modal=document.querySelector(".po-modal-overlay .po-modal");
  if(!modal)return;
  try{
    const data=await api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/ocr-lines`);
    const rows=(data.rows||[]).filter(economicProduct);
    repairEmptyState(modal.querySelector(".mws-ocr-resolution-panel"),rows);
    if(!rows.length)return;
    const lineTotal=round2(rows.reduce((sum,row)=>sum+Number(row.grossAmount||0),0));
    const invoiceTotal=await invoiceTotalFor(data,modal);
    if(!(Number(invoiceTotal)>0))return;
    const difference=round2(lineTotal-Number(invoiceTotal));
    renderReconciliation(modal,{invoiceTotal:Number(invoiceTotal),lineTotal,difference,withinTolerance:Math.abs(difference)<=TOLERANCE+0.000001,rowCount:rows.length});
  }catch{}
}

function schedule(orderId=activeOrderId){
  if(!orderId)return;
  for(const delay of [80,250,700,1400])setTimeout(()=>inspect(orderId),delay);
}

document.addEventListener("click",event=>{
  const open=event.target.closest?.("[data-po-open]");
  if(open){activeOrderId=open.dataset.poOpen||"";schedule(activeOrderId);}
},true);

document.addEventListener("purchase:orders:refresh",()=>schedule(),true);
