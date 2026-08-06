function readUser(){
  try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}
}

function fallbackFor(path){
  if(path.startsWith("/api/dashboard"))return {stores:0,employees:0,temporary:0,uncovered:0};
  if(path.startsWith("/api/employees"))return [];
  if(path.startsWith("/api/stores"))return [];
  if(path.startsWith("/api/leaves"))return [];
  if(path.startsWith("/api/availability"))return [];
  if(path.startsWith("/api/shifts"))return [];
  if(path.startsWith("/api/schedules/latest"))return null;
  return {};
}

function ensureStyles(){
  if(document.getElementById("owner-password-change-style"))return;
  const style=document.createElement("style");
  style.id="owner-password-change-style";
  style.textContent=`
    .owner-password-gate{position:fixed;inset:0;z-index:10000;background:linear-gradient(135deg,rgba(10,29,61,.97),rgba(20,87,126,.96));display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif}
    .owner-password-card{width:min(480px,100%);box-sizing:border-box;background:#fff;border-radius:24px;padding:32px;box-shadow:0 30px 80px rgba(0,0,0,.35);display:grid;gap:17px;color:#17223b}
    .owner-password-mark{width:58px;height:58px;border-radius:18px;background:#e1f5ef;color:#0f766e;display:grid;place-items:center;font-size:27px;font-weight:900}
    .owner-password-card h1{font-size:27px;margin:0}.owner-password-card p{margin:0;color:#61708a;line-height:1.55}
    .owner-password-card label{display:grid;gap:7px;font-size:13px;font-weight:800}.owner-password-card input{padding:13px 14px;border:1px solid #cbd5e1;border-radius:11px;font:inherit}
    .owner-password-card button{border:0;border-radius:11px;padding:13px;background:#0f766e;color:#fff;font-weight:900;cursor:pointer}.owner-password-card button:disabled{opacity:.55;cursor:not-allowed}
    .owner-password-error{padding:11px 12px;border-radius:10px;background:#ffe6e6;color:#9b1c1c;font-weight:700;font-size:13px}
    .owner-password-note{padding:11px 12px;border-radius:10px;background:#edf6ff;color:#1d4f78;font-size:12px;line-height:1.45}
  `;
  document.head.appendChild(style);
}

function showGate(){
  if(document.getElementById("owner-password-gate"))return;
  ensureStyles();
  const user=readUser();
  if(!user?.mustChangePassword)return;

  const root=document.createElement("div");
  root.id="owner-password-gate";
  root.className="owner-password-gate";
  root.innerHTML=`
    <form class="owner-password-card">
      <div class="owner-password-mark">MW</div>
      <div><h1>Δημιουργία προσωπικού κωδικού</h1><p>Ο κωδικός που χρησιμοποίησες είναι προσωρινός. Δημιούργησε τώρα τον δικό σου κωδικό πριν ανοίξει το Backoffice.</p></div>
      <label>Νέος κωδικός<input name="newPassword" type="password" minlength="10" maxlength="100" autocomplete="new-password" required></label>
      <label>Επανάληψη νέου κωδικού<input name="confirmPassword" type="password" minlength="10" maxlength="100" autocomplete="new-password" required></label>
      <div class="owner-password-note">Ο νέος κωδικός πρέπει να έχει τουλάχιστον 10 χαρακτήρες και να είναι διαφορετικός από τον προσωρινό.</div>
      <div class="owner-password-error" hidden></div>
      <button type="submit">Αποθήκευση και είσοδος</button>
    </form>`;
  document.body.appendChild(root);

  const form=root.querySelector("form");
  const button=root.querySelector("button");
  const errorBox=root.querySelector(".owner-password-error");
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const newPassword=String(data.get("newPassword")||"");
    const confirmPassword=String(data.get("confirmPassword")||"");
    errorBox.hidden=true;
    if(newPassword!==confirmPassword){
      errorBox.textContent="Οι δύο νέοι κωδικοί δεν είναι ίδιοι.";
      errorBox.hidden=false;
      return;
    }
    button.disabled=true;
    button.textContent="Αποθήκευση…";
    try{
      const token=localStorage.getItem("token");
      const response=await window.__ownerPasswordOriginalFetch("/api/auth/change-password",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({newPassword,confirmPassword,deviceName:"Backoffice πελάτη"})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Η αλλαγή κωδικού απέτυχε.");
      localStorage.setItem("token",result.token);
      localStorage.setItem("user",JSON.stringify(result.user));
      root.remove();
      window.location.reload();
    }catch(error){
      errorBox.textContent=error.message;
      errorBox.hidden=false;
      button.disabled=false;
      button.textContent="Αποθήκευση και είσοδος";
    }
  });
}

export function installOwnerPasswordChangeGate(){
  if(window.__ownerPasswordGateInstalled)return;
  window.__ownerPasswordGateInstalled=true;
  const originalFetch=window.fetch.bind(window);
  window.__ownerPasswordOriginalFetch=originalFetch;

  window.fetch=async(input,init={})=>{
    const requestUrl=typeof input==="string"?input:input?.url||"";
    const url=new URL(requestUrl,window.location.origin);
    const user=readUser();
    const allowed=url.pathname.startsWith("/api/auth/");
    if(user?.mustChangePassword&&!allowed){
      return new Response(JSON.stringify(fallbackFor(url.pathname)),{status:200,headers:{"Content-Type":"application/json"}});
    }
    const response=await originalFetch(input,init);
    if(url.pathname==="/api/auth/login"&&response.ok){
      const cloned=response.clone();
      cloned.json().then(result=>{
        if(result?.user?.mustChangePassword)setTimeout(showGate,0);
      }).catch(()=>{});
    }
    return response;
  };

  const refresh=()=>{
    const user=readUser();
    if(user?.mustChangePassword)showGate();
    else document.getElementById("owner-password-gate")?.remove();
  };
  refresh();
  const timer=setInterval(refresh,300);
  window.addEventListener("beforeunload",()=>clearInterval(timer),{once:true});
}
