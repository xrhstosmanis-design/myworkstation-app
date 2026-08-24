import fs from "fs";

const path=new URL("../src/components/store/StorePosPanel.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_OFFLINE_CATALOG_V1";
if(src.includes(marker)){
  console.log("KAT offline catalog fallback already installed.");
  process.exit(0);
}

const importAnchor='const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});';
if(!src.includes(importAnchor))throw new Error("KAT offline catalog anchor missing: euro helper");
src=src.replace(importAnchor,`${importAnchor}\nconst KAT_OFFLINE_CATALOG_V1=true;\nconst offlineCatalogKey=storeId=>\`myworkstation:offline-pos-catalog:\${storeId}\`;\nconst readOfflineCatalog=storeId=>{try{const row=JSON.parse(localStorage.getItem(offlineCatalogKey(storeId))||"null");return row&&row.data?row:null}catch{return null}};\nconst writeOfflineCatalog=(storeId,data)=>{try{localStorage.setItem(offlineCatalogKey(storeId),JSON.stringify({savedAt:Date.now(),data}))}catch{}};`);

const loadAnchor='  const load=async()=>{setError("");try{const [pos,holds]=await Promise.all([api(`/api/store-pos/stores/${store.id}`),api(`/api/store-pos/stores/${store.id}/holds`).catch(()=>({rows:[]}))]);setData(pos);setHoldCount((holds.rows||[]).length)}catch(err){setError(err.message)}};';
if(!src.includes(loadAnchor))throw new Error("KAT offline catalog anchor missing: load function");
const loadReplacement='  const load=async()=>{setError("");try{const [pos,holds]=await Promise.all([api(`/api/store-pos/stores/${store.id}`),api(`/api/store-pos/stores/${store.id}/holds`).catch(()=>({rows:[]}))]);setData(pos);writeOfflineCatalog(store.id,pos);setHoldCount((holds.rows||[]).length)}catch(err){const cached=readOfflineCatalog(store.id);if(cached){setData(cached.data);setHoldCount(0);setMessage(`Offline λειτουργία καταλόγου · τελευταία ενημέρωση ${new Date(cached.savedAt).toLocaleString("el-GR")}. Οι πωλήσεις παραμένουν μπλοκαρισμένες μέχρι να ενεργοποιηθεί ασφαλές offline queue.`)}else setError(err.message)}};';
src=src.replace(loadAnchor,loadReplacement);

fs.writeFileSync(path,src);
console.log("KAT offline POS catalog fallback installed.");
