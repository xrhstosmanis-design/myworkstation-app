import fs from "fs";

const path=new URL("../src/components/store/StoreOperatorApp.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_OFFLINE_RUNTIME_ACCESS_V1";
if(src.includes(marker)){
  console.log("KAT offline runtime access preservation already installed.");
  process.exit(0);
}

const keyAnchor='const STORE_SYNC_KEY="myworkstation:store-sync";';
if(!src.includes(keyAnchor))throw new Error("KAT offline runtime access anchor missing: STORE_SYNC_KEY");
src=src.replace(keyAnchor,`${keyAnchor}\nconst ${marker}=true;\nconst runtimeAccessKey=storeId=>\`myworkstation:pos-runtime-access:\${storeId}\`;\nconst readRuntimeAccess=storeId=>{try{const value=JSON.parse(localStorage.getItem(runtimeAccessKey(storeId))||"null");return value&&typeof value==="object"?value:null}catch{return null}};\nconst writeRuntimeAccess=(storeId,access)=>{try{if(access&&typeof access==="object")localStorage.setItem(runtimeAccessKey(storeId),JSON.stringify(access))}catch{}};`);

const stateAnchor=' const [directory,setDirectory]=useState(null),[session,setSession]=useState(()=>{try{const saved=JSON.parse(sessionStorage.getItem("storeOperatorSession")||"null");return saved?.store?.id===storeId?saved:null}catch{return null}}),[runtimeAccess,setRuntimeAccess]=useState(null);';
if(!src.includes(stateAnchor))throw new Error("KAT offline runtime access anchor missing: state");
src=src.replace(stateAnchor,' const [directory,setDirectory]=useState(null),[session,setSession]=useState(()=>{try{const saved=JSON.parse(sessionStorage.getItem("storeOperatorSession")||"null");return saved?.store?.id===storeId?saved:null}catch{return null}}),[runtimeAccess,setRuntimeAccess]=useState(()=>readRuntimeAccess(storeId));');

const effectAnchor=' useEffect(()=>{if(!session){setRuntimeAccess(null);applyPosPermissionStyle(null);return}let alive=true;const refresh=()=>api(`/api/store-pos/stores/${session.store.id}`).then(result=>{if(alive)setRuntimeAccess(result.access||{})}).catch(()=>{if(alive)setRuntimeAccess({})});refresh();const timer=setInterval(refresh,30000);return()=>{alive=false;clearInterval(timer)}},[session?.store?.id]);';
if(!src.includes(effectAnchor))throw new Error("KAT offline runtime access anchor missing: refresh effect");
const effectReplacement=' useEffect(()=>{if(!session){setRuntimeAccess(null);applyPosPermissionStyle(null);return}let alive=true;const cached=readRuntimeAccess(session.store.id);if(cached&&alive)setRuntimeAccess(current=>current||cached);const refresh=()=>api(`/api/store-pos/stores/${session.store.id}`).then(result=>{const access=result.access||{};writeRuntimeAccess(session.store.id,access);if(alive)setRuntimeAccess(access)}).catch(()=>{if(alive){const fallback=readRuntimeAccess(session.store.id);if(fallback)setRuntimeAccess(fallback)}});refresh();const timer=setInterval(refresh,30000);return()=>{alive=false;clearInterval(timer)}},[session?.store?.id]);';
src=src.replace(effectAnchor,effectReplacement);

fs.writeFileSync(path,src);
console.log("KAT offline runtime access preservation installed.");
