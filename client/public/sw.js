const CACHE_NAME="myworkstation-shell-v1";
self.addEventListener("install",event=>{self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(self.clients.claim())});

const applicationUrl=value=>{
  try{
    const url=new URL(value||"/",self.location.origin);
    if(url.origin===self.location.origin)return url;
  }catch{}
  return new URL("/",self.location.origin);
};
const sameStore=(client,storeId)=>{
  if(!storeId)return false;
  try{
    const url=new URL(client.url);
    return url.origin===self.location.origin&&[`/store/${encodeURIComponent(String(storeId))}`,`/chat/${encodeURIComponent(String(storeId))}`].includes(url.pathname.replace(/\/$/,""));
  }catch{return false}
};
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{}
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    const visibleStoreWindows=windows.filter(client=>client.visibilityState==="visible"&&sameStore(client,data.storeId));
    if(visibleStoreWindows.length&&data.requiresSystemNotification!==true){
      visibleStoreWindows.forEach(client=>client.postMessage({...data,type:"STORE_CHAT_PUSH"}));
      return;
    }
    return self.registration.showNotification(data.title||"MyWorkStation · Chat",{
      body:data.body||"Νέο μήνυμα στο Chat",icon:"/pwa-192.png",badge:"/pwa-192.png",
      tag:`store-chat-${data.storeId||"message"}`,renotify:true,silent:false,vibrate:[200,100,200],
      data:{url:applicationUrl(data.storeId?`/chat/${encodeURIComponent(String(data.storeId))}`:data.url).href}
    });
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const original=applicationUrl(event.notification.data?.url);
  const legacyStore=original.pathname.match(/^\/store\/([^/]+)\/?$/);
  const target=legacyStore?applicationUrl(`/chat/${legacyStore[1]}`):original;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>{
      try{const url=new URL(client.url);return url.origin===target.origin&&url.pathname.replace(/\/$/,"")===target.pathname.replace(/\/$/,"")}catch{return false}
    });
    if(existing){
      if(target.pathname.startsWith("/chat/"))existing.postMessage({type:"STORE_CHAT_OPEN",storeId:decodeURIComponent(target.pathname.split("/")[2])});
      return existing.focus();
    }
    return clients.openWindow(target.href);
  }));
});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request))) });
