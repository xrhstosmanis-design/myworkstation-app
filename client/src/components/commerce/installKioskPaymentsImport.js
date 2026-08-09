const canUse=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};
const style=()=>{if(document.getElementById("kiosk-payments-import-style"))return;const el=document.createElement("style");el.id="kiosk-payments-import-style";el.textContent=`.owner-kiosk-import{border:1px solid #0ea5e9!important;background:#e9f8ff!important;color:#075985!important;font-weight:900!important}.owner-kiosk-import:hover{background:#d8f3ff!important}.owner-kiosk-import-status{margin:8px 0;padding:10px 12px;border:1px solid #bfe5f5;background:#f2fbff;border-radius:9px;color:#17445b;font-size:12px;font-weight:700}.owner-kiosk-import-status.error{border-color:#f2b8b5;background:#fff5f5;color:#9d1c1c}.owner-kiosk-import-status b{display:block;margin-bottom:3px}`;document.head.appendChild(el)};
const readBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");reader.onerror=()=>reject(new Error("Δεν διαβάστηκε το αρχείο."));reader.readAsDataURL(file)});
async function post(path,body){const token=localStorage.getItem("token");const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data}
function status(root,message,error=false){let box=root.querySelector(".owner-kiosk-import-status");if(!box){box=document.createElement("div");box.className="owner-kiosk-import-status";const filter=root.querySelector(".owner-payments-filter");filter?.after(box)}box.classList.toggle("error",error);box.innerHTML=message}
function install(root){
  if(!canUse())return;
  const actions=root.querySelector(".owner-payments-filter-actions");if(!actions||actions.dataset.kioskImportBound)return;
  actions.dataset.kioskImportBound="1";style();
  const button=document.createElement("button");button.type="button";button.className="owner-kiosk-import";button.textContent="⬆ Εισαγωγή Kiosk Excel / CSV";
  const input=document.createElement("input");input.type="file";input.accept=".xlsx,.xls,.csv";input.hidden=true;
  actions.append(button,input);
  button.addEventListener("click",()=>input.click());
  input.addEventListener("change",async()=>{
    const file=input.files?.[0];if(!file)return;
    const storeId=root.querySelector("[data-op-store]")?.value||"";
    if(!storeId){status(root,"<b>Επίλεξε πρώτα συγκεκριμένο κατάστημα.</b>Η εισαγωγή δεν γίνεται όταν είναι επιλεγμένα «Όλα τα καταστήματα».",true);input.value="";return}
    if(!/\.(xlsx|xls|csv)$/i.test(file.name)){status(root,"<b>Μη υποστηριζόμενο αρχείο.</b>Χρησιμοποίησε Excel .xlsx/.xls ή CSV export από Kiosk Manager.",true);input.value="";return}
    if(file.size>8*1024*1024){status(root,"<b>Το αρχείο είναι πολύ μεγάλο.</b>Το όριο είναι 8 MB ανά εισαγωγή.",true);input.value="";return}
    button.disabled=true;button.textContent="Εισαγωγή…";status(root,"<b>Γίνεται ασφαλής ανάγνωση του export Kiosk.</b>Δεν αλλάζει Kiosk Manager, RBS ή ταμειακή.");
    try{
      const dataBase64=await readBase64(file);
      const result=await post("/api/owner-payments/import-kiosk",{storeId,filename:file.name,dataBase64});
      status(root,`<b>${result.message}</b>Βρέθηκαν ${result.found} · εισήχθησαν ${result.inserted} · διπλές ${result.duplicates} · αγνοήθηκαν ${result.skipped}. Οι εισαγόμενες γραμμές σημειώνονται ως «Kiosk · …» και δεν αφαιρούνται από καμία βάρδια.`);
      root.querySelector("[data-op-search]")?.click();
    }catch(error){status(root,`<b>Η εισαγωγή δεν ολοκληρώθηκε.</b>${String(error.message||error)}`,true)}
    finally{button.disabled=false;button.textContent="⬆ Εισαγωγή Kiosk Excel / CSV";input.value=""}
  });
}
export function installKioskPaymentsImport(){const run=()=>document.querySelectorAll(".owner-payments-suite").forEach(install);run();const observer=new MutationObserver(run);observer.observe(document.documentElement,{childList:true,subtree:true})}
