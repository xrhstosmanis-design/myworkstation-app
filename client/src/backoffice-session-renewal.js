const tokenPayload=token=>{try{const part=token.split(".")[1];return JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=")))}catch{return null}};

export function installBackofficeSessionRenewal(){
  let renewing=false;
  const renew=async()=>{
    if(renewing)return;
    const previous=localStorage.getItem("token"),payload=previous&&tokenPayload(previous);
    if(payload?.tokenType!=="BACKOFFICE_USER"||!payload.sessionId||!payload.exp)return;
    if(payload.exp*1000-Date.now()>30*60*1000)return;
    renewing=true;
    try{
      const response=await fetch("/api/auth/renew",{method:"POST",headers:{Authorization:`Bearer ${previous}`,"Content-Type":"application/json"},body:"{}"});
      if(!response.ok)return;
      const result=await response.json();
      if(result.token&&localStorage.getItem("token")===previous){
        localStorage.setItem("token",result.token);
        if(result.platformToken&&localStorage.getItem("supportContext"))sessionStorage.setItem("platformToken",result.platformToken);
      }
    }catch{/* A temporary network problem must not sign out or discard work. */}
    finally{renewing=false}
  };
  window.setInterval(renew,60*1000);
  document.addEventListener("visibilitychange",renew);
  window.addEventListener("focus",renew);
  renew();
}
