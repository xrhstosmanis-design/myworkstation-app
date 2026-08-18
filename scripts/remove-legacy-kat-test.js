import fs from "node:fs";

const file="client/src/entry.jsx";
let src=fs.readFileSync(file,"utf8");

src=src.replace('import KatTestCenter from "./components/platform/KatTestCenter.jsx";\n','');
src=src.replace('const katTestMatch=window.location.pathname.match(/^\\/platform-admin\\/kat-test\\/?$/);\n','');
src=src.replace('const TEST_COMPANY_ID="kat-test-company";\nconst TEST_STORE_ID="kat-test-store";\n','');

src=src.replace(/\nconst readStored=key=>\{try\{return JSON\.parse\(localStorage\.getItem\(key\)\|\|"null"\)\}catch\{return null\}\};\nconst returnFromStaleTestPos=\(\)=>\{[\s\S]*?\n\};\n/,'\n');

src=src.replace('  if(posMatch&&response.status===404&&data.error==="Δεν βρέθηκε ενεργό κατάστημα."){returnFromStaleTestPos();return new Promise(()=>{})}\n','');
src=src.replace(/\nconst KatTestQuickAccess=\(\)=>[\s\S]*?;\n/,'\n');

src=src.replace('if(katTestMatch){document.title="MyWorkStation TEST";createRoot(document.getElementById("root")).render(<KatTestCenter/>)}\nelse if(platformMatch){document.title="MyWorkStation Platform Admin";createRoot(document.getElementById("root")).render(<><PlatformAdminApp/><CommercialLicenseCenter/><MasterCatalogCenter/><PlatformPromotionCenter/><KatTestQuickAccess/></>)}\nelse if(posMatch){const storeId=decodeURIComponent(posMatch[1]);const stored=readStored("storeOperatorSession");const staleTestSession=stored&&(stored.store?.id!==TEST_STORE_ID||stored.company?.id!==TEST_COMPANY_ID||stored.store?.name!=="TEST"||stored.company?.name!=="TEST"||storeId!==TEST_STORE_ID);document.title="MyWorkStation POS";if(staleTestSession)returnFromStaleTestPos();else createRoot(document.getElementById("root")).render(<><CommercialPosApp api={storeApi} storeId={storeId}/><PosSaleActionsPanel api={storeApi} storeId={storeId}/></>)}',
'if(platformMatch){document.title="MyWorkStation Platform Admin";createRoot(document.getElementById("root")).render(<><PlatformAdminApp/><CommercialLicenseCenter/><MasterCatalogCenter/><PlatformPromotionCenter/></>)}\nelse if(posMatch){const storeId=decodeURIComponent(posMatch[1]);document.title="MyWorkStation POS";createRoot(document.getElementById("root")).render(<><CommercialPosApp api={storeApi} storeId={storeId}/><PosSaleActionsPanel api={storeApi} storeId={storeId}/></>)}');

const leftovers=["KatTestCenter","katTestMatch","KatTestQuickAccess","returnFromStaleTestPos"].filter(name=>src.includes(name));
if(leftovers.length)console.warn(`Legacy KAT TEST cleanup warning: remaining references: ${leftovers.join(", ")}`);

fs.writeFileSync(file,src);
console.log("Legacy KAT TEST center cleanup completed without blocking build");
