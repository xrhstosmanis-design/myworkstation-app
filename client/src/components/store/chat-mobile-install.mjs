export function mobileChatUrl(storeId){return storeId?"/chat/"+encodeURIComponent(storeId)+"/":"/chat/"}
export function chatWorkerOptions(pathname,storeId){
 return /^\/chat(?:\/|$)/.test(pathname)?{url:"/chat/sw.js",scope:"/chat/"}:{url:"/sw.js",scope:"/"};
}
export async function registerChatWorker(storeId){
 const options=chatWorkerOptions(location.pathname,storeId);
 if(options.scope!=="/"&&!location.pathname.endsWith("/"))history.replaceState(null,"",location.pathname+"/"+location.search+location.hash);
 const registration=await navigator.serviceWorker.register(options.url,{scope:options.scope});
 const worker=registration.installing||registration.waiting||registration.active;
 if(worker&&worker.state!=="activated")await new Promise((resolve,reject)=>{const changed=()=>{if(worker.state==="activated"){worker.removeEventListener("statechange",changed);resolve()}else if(worker.state==="redundant"){worker.removeEventListener("statechange",changed);reject(new Error("Δεν ενεργοποιήθηκε η υπηρεσία ειδοποιήσεων."))}};worker.addEventListener("statechange",changed);changed()});
 return registration;
}
