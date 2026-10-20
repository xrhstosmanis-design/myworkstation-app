/* Static wholesale application shell only. Private data is never cached here. */
const SHELL_FILES=__WHOLESALE_SHELL_FILES__;
const CACHE_PREFIX='mws-wholesale-shell-';
const CACHE_NAME=CACHE_PREFIX+'__WHOLESALE_SHELL_VERSION__';
const SHELL_PATHS=new Set(SHELL_FILES);
const ENTRY_PATHS=new Set(['/wholesale','/wholesale/','/wholesale.html']);
self.addEventListener('install',event=>{
  // A failed precache leaves the previous worker in charge. Never activate an
  // incomplete update, reload a page, or disturb an uncertain business request.
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{await cache.addAll(SHELL_FILES.map(file=>new Request(file,{cache:'reload',credentials:'omit'})))}
    catch(error){await caches.delete(CACHE_NAME);throw error}
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('Authorization'))return;
  if(request.mode==='navigate'&&ENTRY_PATHS.has(url.pathname)){
    // Query strings (store IDs etc.) are never cache keys. The fallback contains
    // public HTML/JS only, not a serialized session or a server response.
    event.respondWith((async()=>{
      try{return await fetch(request)}catch(error){
        const fallback=await(await caches.open(CACHE_NAME)).match('/wholesale/');
        if(fallback)return fallback;
        throw error;
      }
    })());return;
  }
  if(url.search||!SHELL_PATHS.has(url.pathname)||ENTRY_PATHS.has(url.pathname))return;
  event.respondWith((async()=>{
    const cached=await(await caches.open(CACHE_NAME)).match(url.pathname);
    return cached||fetch(request);
  })());
});
