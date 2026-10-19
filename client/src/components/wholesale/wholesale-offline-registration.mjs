let pending;
export async function ensureWholesaleOfflineShell(environment=globalThis.window){
  if(!environment?.isSecureContext||!environment.navigator?.serviceWorker||!/^\/wholesale(?:\/|\.html|$)/.test(environment.location?.pathname||''))throw Error('Η προετοιμασία offline χρειάζεται ασφαλή είσοδο στην εφαρμογή χονδρικής από υποστηριζόμενο browser.');
  // Do not return a different origin-wide retail worker as proof of readiness.
  const registration=await environment.navigator.serviceWorker.register('/wholesale-sw.js',{scope:'/wholesale',updateViaCache:'none'});
  if(new URL(registration.scope).origin!==environment.location.origin||new URL(registration.scope).pathname!=='/wholesale')throw Error('Δεν επιβεβαιώθηκε η εγκατάσταση της εφαρμογής χονδρικής.');
  if(registration.active?.state==='activated')return registration;
  return new Promise((resolve,reject)=>{
    const worker=registration.installing||registration.waiting;
    if(!worker)return reject(Error('Δεν ολοκληρώθηκε η λήψη της offline εφαρμογής. Δοκίμασε ξανά με σύνδεση.'));
    const clear=()=>{environment.clearTimeout(timer);worker.removeEventListener('statechange',changed)};
    const changed=()=>{
      if(worker.state==='activated'){clear();resolve(registration)}
      else if(worker.state==='redundant'){clear();reject(Error('Η λήψη της offline εφαρμογής απέτυχε.'))}
    };
    const timer=environment.setTimeout(()=>{clear();reject(Error('Η προετοιμασία offline δεν ολοκληρώθηκε. Κράτησε τη σύνδεση και δοκίμασε ξανά.'))},90000);
    worker.addEventListener('statechange',changed);changed();
  });
}

export function prepareWholesaleShellInBackground(){
  // Static shell download only. No session, snapshot, order or permission write.
  pending||=ensureWholesaleOfflineShell().catch(()=>{pending=null;return null});
  return pending;
}
