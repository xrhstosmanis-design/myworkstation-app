
const key="chatAppSession";
export function chatSession(){try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}
export function saveChatSession(data){localStorage.setItem(key,JSON.stringify({token:data.token,user:data.user}));localStorage.removeItem("chatAppSignedOut")}
export function clearChatSession(){localStorage.removeItem(key);localStorage.setItem("chatAppSignedOut","1")}
export function chatToken(){return chatSession()?.token||(!localStorage.getItem("chatAppSignedOut")?(localStorage.getItem("token")||sessionStorage.getItem("storeOperatorToken")||""):"")}
export async function chatApi(path,options={}){
 const token=options.anonymous?"":chatToken();
 const {anonymous,...fetchOptions}=options;
 const response=await fetch(path,{...fetchOptions,cache:"no-store",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error||"Δεν είναι διαθέσιμη η συνομιλία.");error.status=response.status;throw error}
 return data;
}
