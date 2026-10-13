import {registerChatWorker} from "./chat-mobile-install.mjs";
import {pushSubscriptionFailure} from "./store-chat-push-diagnostic.mjs";

let activation=null;
export function activateMobileChatPush(api,base,{requestPermission=true}={}){
 if(requestPermission&&activation)return activation;
 // One browser subscription and server binding at a time, including repeated taps.
 const permission=requestPermission&&typeof Notification!=="undefined"?Notification.requestPermission():Promise.resolve(typeof Notification!=="undefined"?Notification.permission:"unsupported");
 const task=(async()=>{
  if(!("Notification" in window)||!("PushManager" in window)||!("serviceWorker" in navigator))throw new Error("Άνοιξε τον σύνδεσμο με Chrome ή την εγκατεστημένη εφαρμογή. Στο iPhone χρησιμοποίησε την εφαρμογή από την αρχική οθόνη.");
  if(await permission!=="granted"){if(!requestPermission)return null;throw new Error("Οι ειδοποιήσεις δεν επιτρέπονται. Έλεγξε την άδεια ειδοποιήσεων της εφαρμογής στις ρυθμίσεις του κινητού.")}
  let registration=await registerChatWorker(),subscription=await registration.pushManager.getSubscription();
  if(!subscription){
   if(!requestPermission)return null;
   const {publicKey}=await api(base+"/push-key"),raw=atob((publicKey+"=".repeat((4-publicKey.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/"));
   const options={userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))};
   try{subscription=await registration.pushManager.subscribe(options)}catch(firstError){
    await registration.update().catch(()=>{});registration=await registerChatWorker();
    await new Promise(resolve=>setTimeout(resolve,500));subscription=await registration.pushManager.getSubscription();
    if(!subscription)try{subscription=await registration.pushManager.subscribe(options)}catch(retryError){throw new Error(pushSubscriptionFailure(firstError,retryError),{cause:retryError})}
   }
  }
  await api(base+"/push-subscription",{method:"POST",body:JSON.stringify({subscription:subscription.toJSON()})});
  return subscription;
 })();
 if(!requestPermission)return task;
 activation=task.finally(()=>{activation=null});
 return activation;
}
