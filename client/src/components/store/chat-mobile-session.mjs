
const key="chatAppSession";
export function chatSession(){
 try{
  const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved)return saved;
  if(localStorage.getItem("chatAppSignedOut"))return null;
  const token=localStorage.getItem("token")||sessionStorage.getItem("storeOperatorToken");
  if(!token)return null;
  // UI hint only. Every Chat request still validates the existing physical session server-side.
  const raw=token.split(".")[1],bytes=Uint8Array.from(atob(raw.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0)),payload=JSON.parse(new TextDecoder().decode(bytes));
  if(payload.tokenType==="BACKOFFICE_USER")return {token,borrowed:true,user:{id:payload.id,fullName:payload.fullName,role:payload.role,company:{id:payload.companyId}}};
  if(payload.tokenType!=="STORE_OPERATOR"||!payload.storeId)return null;
  return {token,user:{id:payload.id,chatOperator:true,legacy:true,fullName:payload.fullName,store:{id:payload.storeId},company:{id:payload.companyId}}};
 }catch{return null}
}
export function saveChatSession(data){localStorage.setItem(key,JSON.stringify({token:data.token,user:data.user,borrowed:Boolean(data.borrowed)}));localStorage.removeItem("chatAppSignedOut")}
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
