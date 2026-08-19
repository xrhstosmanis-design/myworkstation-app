// Bridge the canonical Store/POS localStorage session to the legacy online-orders bootstrap.
// Scoped only to Store/POS routes so BackOffice/Platform sessions are never copied.
const isStoreRuntime=/^\/(?:store|pos)\//.test(window.location.pathname);

function syncKatOnlineOrderSession(){
  if(!isStoreRuntime)return;
  const operatorSession=localStorage.getItem("storeOperatorSession");
  const token=localStorage.getItem("token");

  if(operatorSession){
    sessionStorage.setItem("storeOperatorSession",operatorSession);
    if(token)sessionStorage.setItem("storeOperatorToken",token);
  }else{
    sessionStorage.removeItem("storeOperatorSession");
    sessionStorage.removeItem("storeOperatorToken");
  }
}

syncKatOnlineOrderSession();
const bridgeTimer=window.setInterval(syncKatOnlineOrderSession,1000);
window.addEventListener("storage",syncKatOnlineOrderSession);
window.addEventListener("pagehide",()=>window.clearInterval(bridgeTimer),{once:true});
