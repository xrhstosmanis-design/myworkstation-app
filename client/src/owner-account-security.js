import QRCode from "qrcode";

function readUser(){
  try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}
}

function defaultDeviceName(){
  const stored=localStorage.getItem("ownerDeviceName");
  if(stored)return stored;
  const platform=navigator.userAgentData?.platform||navigator.platform||"";
  return /win/i.test(platform)?"Windows Backoffice":"Προσωπική συσκευή";
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function fallbackFor(path){
  if(path.startsWith("/api/dashboard"))return {stores:0,employees:0,temporary:0,uncovered:0};
  if(path.startsWith("/api/employees")||path.startsWith("/api/stores")||path.startsWith("/api/leaves")||path.startsWith("/api/availability")||path.startsWith("/api/shifts"))return [];
  if(path.startsWith("/api/schedules/latest"))return null;
  return {};
}

function ensureStyles(){
  if(document.getElementById("owner-account-security-style"))return;
  const style=document.createElement("style");
  style.id="owner-account-security-style";
  style.textContent=`
    .owner-security-launcher{position:fixed;right:24px;bottom:82px;z-index:38;border:0;border-radius:999px;padding:13px 18px;background:#123d6a;color:#fff;font-weight:900;box-shadow:0 16px 38px rgba(18,61,106,.28);cursor:pointer}
    .owner-security-overlay{position:fixed;inset:0;z-index:10020;background:rgba(7,21,42,.72);display:grid;place-items:center;padding:22px;font-family:Inter,system-ui,sans-serif}
    .owner-security-card{position:relative;width:min(1080px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;padding:28px;box-shadow:0 30px 90px rgba(0,0,0,.38);color:#17223b}
    .owner-security-card.narrow{width:min(500px,96vw)}
    .owner-security-close{position:absolute;right:18px;top:16px;border:0;background:#eef2f7;border-radius:50%;width:36px;height:36px;font-size:20px;cursor:pointer}
    .owner-security-head{padding-right:45px}.owner-security-head h2{margin:0 0 5px}.owner-security-head p{margin:0;color:#66758d}
    .owner-security-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:22px 0}.owner-security-summary article{border:1px solid #dce5ef;border-radius:15px;padding:16px;display:grid;gap:5px}.owner-security-summary span{color:#64748b}
    .owner-security-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 22px}.owner-security-actions button,.owner-security-card form button{border:0;border-radius:11px;padding:12px 15px;background:#0f766e;color:#fff;font-weight:900;cursor:pointer}.owner-security-actions button.secondary{background:#e8eef5;color:#203957}.owner-security-actions button.danger{background:#b42318}
    .owner-security-section{margin-top:22px}.owner-security-section h3{margin:0 0 12px}.owner-security-list{display:grid;gap:9px}.owner-security-row{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:12px;align-items:center;border:1px solid #dde6f0;border-radius:14px;padding:13px}.owner-security-row span,.owner-security-row small{color:#6c7890}.owner-security-row button{border:0;border-radius:9px;padding:9px 11px;background:#ffe7e5;color:#9b1c1c;font-weight:800;cursor:pointer}.owner-security-state{font-size:12px;font-weight:900;color:#0f766e!important}.owner-security-state.off{color:#8b5e00!important}
    .owner-security-form{display:grid;gap:14px}.owner-security-form label{display:grid;gap:7px;font-size:13px;font-weight:800}.owner-security-form input{padding:13px;border:1px solid #cad5e2;border-radius:11px;font:inherit}.owner-security-error{padding:11px;border-radius:10px;background:#ffe7e5;color:#9b1c1c;font-weight:700}.owner-security-note{padding:11px;border-radius:10px;background:#edf6ff;color:#24547c;line-height:1.45}.owner-security-qr{width:230px;max-width:100%;margin:auto}.owner-security-secret{display:block;padding:10px;background:#f4f7fa;border-radius:9px;word-break:break-all}.owner-recovery-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:15px 0}.owner-recovery-grid code{padding:9px;background:#f1f5f9;border-radius:8px;text-align:center}
    @media(max-width:760px){.owner-security-summary{grid-template-columns:1fr}.owner-security-row{grid-template-columns:1fr}.owner-security-launcher{right:14px}.owner-recovery-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function nativeRequest(path,options={}){
  const token=localStorage.getItem("token");
  const response=await window.__ownerSecurityNativeFetch(path,{
    ...options,
    headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

function saveSession(result){
  localStorage.setItem("token",result.token);
  localStorage.setItem("user",JSON.stringify(result.user));
  localStorage.setItem("ownerDeviceName",defaultDeviceName());
}

function clearSession(){
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("activeModules");
  location.reload();
}

function showMfaGate(){
  if(document.getElementById("owner-mfa-gate"))return;
  const user=readUser();
  if(user?.role!=="OWNER"||!user?.mfaRequired)return;
  ensureStyles();
  const root=document.createElement("div");
  root.id="owner-mfa-gate";
  root.className="owner-security-overlay";
  root.innerHTML=`<form class="owner-security-card narrow owner-security-form">
    <div class="owner-security-head"><h2>Επιβεβαίωση δύο βημάτων</h2><p>Γράψε τον κωδικό που εμφανίζει τώρα η εφαρμογή Authenticator.</p></div>
    <label>Κωδικός 2FA ή κωδικός ανάκτησης<input name="code" autocomplete="one-time-code" minlength="6" maxlength="20" required autofocus></label>
    <div class="owner-security-error" hidden></div>
    <button type="submit">Ασφαλής είσοδος</button>
    <button type="button" class="secondary" data-logout>Ακύρωση και έξοδος</button>
  </form>`;
  document.body.appendChild(root);
  const form=root.querySelector("form");
  const errorBox=root.querySelector(".owner-security-error");
  const submit=form.querySelector("button[type=submit]");
  root.querySelector("[data-logout]").addEventListener("click",clearSession);
  form.addEventListener("submit",async event=>{
    event.preventDefault();errorBox.hidden=true;submit.disabled=true;submit.textContent="Έλεγχος…";
    try{
      const code=String(new FormData(form).get("code")||"").trim().toUpperCase();
      const result=await nativeRequest("/api/auth/owner/2fa/verify",{
        method:"POST",
        headers:{},
        body:JSON.stringify({challengeToken:localStorage.getItem("token"),code,deviceName:defaultDeviceName()})
      });
      saveSession(result);
      root.remove();
      location.reload();
    }catch(error){
      errorBox.textContent=error.message;errorBox.hidden=false;submit.disabled=false;submit.textContent="Ασφαλής είσοδος";
    }
  });
}

const eventLabels={
  PASSWORD_REJECTED:"Αποτυχημένος κωδικός",
  LOGIN_SUCCESS:"Επιτυχής σύνδεση",
  OWNER_PASSWORD_ACCEPTED_MFA_REQUIRED:"Σωστός κωδικός — αναμονή 2FA",
  OWNER_TOTP_REJECTED:"Λάθος κωδικός 2FA",
  OWNER_TOTP_LOGIN_SUCCESS:"Επιτυχής σύνδεση 2FA",
  OWNER_RECOVERY_LOGIN_SUCCESS:"Σύνδεση με κωδικό ανάκτησης",
  OWNER_TOTP_SETUP_STARTED:"Έναρξη ενεργοποίησης 2FA",
  OWNER_TOTP_SETUP_REJECTED:"Λάθος κωδικός ενεργοποίησης",
  OWNER_TOTP_ENABLED:"Ενεργοποίηση 2FA",
  OWNER_TOTP_DISABLED:"Απενεργοποίηση 2FA",
  OWNER_SESSION_REVOKED:"Ανάκληση συσκευής",
  OWNER_OTHER_SESSIONS_REVOKED:"Αποσύνδεση άλλων συσκευών",
  TEMPORARY_PASSWORD_LOGIN:"Είσοδος με προσωρινό κωδικό",
  TEMPORARY_PASSWORD_REPLACED:"Δημιουργία προσωπικού κωδικού"
};
const dateTime=value=>value?new Date(value).toLocaleString("el-GR"):"—";

function modalShell(inner,{narrow=false}={}){
  ensureStyles();
  const root=document.createElement("div");
  root.className="owner-security-overlay";
  root.innerHTML=`<section class="owner-security-card ${narrow?"narrow":""}"><button class="owner-security-close">×</button>${inner}</section>`;
  document.body.appendChild(root);
  root.querySelector(".owner-security-close").addEventListener("click",()=>root.remove());
  return root;
}

async function showRecovery(result){
  saveSession(result);
  const codes=result.recoveryCodes||[];
  const root=modalShell(`<div class="owner-security-head"><h2>Το 2FA ενεργοποιήθηκε</h2><p>Αποθήκευσε τους κωδικούς ανάκτησης σε ασφαλές σημείο. Εμφανίζονται μόνο τώρα.</p></div>
    <div class="owner-recovery-grid">${codes.map(code=>`<code>${escapeHtml(code)}</code>`).join("")}</div>
    <div class="owner-security-actions"><button data-copy>Αντιγραφή κωδικών</button><button class="secondary" data-done>Τα αποθήκευσα</button></div>`,{narrow:true});
  root.querySelector("[data-copy]").addEventListener("click",async()=>navigator.clipboard.writeText(codes.join("\n")));
  root.querySelector("[data-done]").addEventListener("click",()=>location.reload());
}

async function startSetup(parent){
  parent.remove();
  let setup;
  try{setup=await nativeRequest("/api/auth/owner/2fa/setup",{method:"POST",body:JSON.stringify({deviceName:defaultDeviceName()})})}
  catch(error){const root=modalShell(`<div class="owner-security-error">${escapeHtml(error.message)}</div>`,{narrow:true});return root}
  const qr=await QRCode.toDataURL(setup.otpAuthUri,{width:230,margin:1,errorCorrectionLevel:"M"});
  const root=modalShell(`<form class="owner-security-form">
    <div class="owner-security-head"><h2>Ενεργοποίηση Authenticator</h2><p>Σκάναρε το QR με Google Authenticator ή Microsoft Authenticator.</p></div>
    <img class="owner-security-qr" src="${qr}" alt="QR ενεργοποίησης 2FA">
    <details><summary>Χειροκίνητος κωδικός</summary><code class="owner-security-secret">${escapeHtml(setup.secret)}</code></details>
    <label>Εξαψήφιος κωδικός<input name="code" inputmode="numeric" minlength="6" maxlength="6" required></label>
    <div class="owner-security-error" hidden></div>
    <button>Ενεργοποίηση 2FA</button>
  </form>`,{narrow:true});
  const form=root.querySelector("form");
  const errorBox=root.querySelector(".owner-security-error");
  form.addEventListener("submit",async event=>{
    event.preventDefault();errorBox.hidden=true;
    try{
      const code=String(new FormData(form).get("code")||"").replace(/\D/g,"").slice(0,6);
      const result=await nativeRequest("/api/auth/owner/2fa/enable",{method:"POST",body:JSON.stringify({setupToken:setup.setupToken,code,deviceName:defaultDeviceName()})});
      root.remove();await showRecovery(result);
    }catch(error){errorBox.textContent=error.message;errorBox.hidden=false}
  });
}

function showDisable(parent){
  parent.remove();
  const root=modalShell(`<form class="owner-security-form">
    <div class="owner-security-head"><h2>Απενεργοποίηση 2FA</h2><p>Για επιβεβαίωση χρειάζονται ο κωδικός λογαριασμού και ένας κωδικός Authenticator.</p></div>
    <label>Κωδικός λογαριασμού<input name="password" type="password" required></label>
    <label>Κωδικός 2FA ή ανάκτησης<input name="code" minlength="6" maxlength="20" required></label>
    <div class="owner-security-error" hidden></div>
    <button>Απενεργοποίηση 2FA</button>
  </form>`,{narrow:true});
  const form=root.querySelector("form");
  const errorBox=root.querySelector(".owner-security-error");
  form.addEventListener("submit",async event=>{
    event.preventDefault();errorBox.hidden=true;
    try{
      const data=new FormData(form);
      const result=await nativeRequest("/api/auth/owner/2fa/disable",{method:"POST",body:JSON.stringify({password:data.get("password"),code:String(data.get("code")||"").toUpperCase(),deviceName:defaultDeviceName()})});
      saveSession(result);location.reload();
    }catch(error){errorBox.textContent=error.message;errorBox.hidden=false}
  });
}

async function openSecurityCenter(){
  let data;
  try{data=await nativeRequest("/api/auth/owner/security")}
  catch(error){modalShell(`<div class="owner-security-error">${escapeHtml(error.message)}</div>`,{narrow:true});return}
  const sessions=(data.sessions||[]).map(session=>{
    const active=!session.revokedAt&&new Date(session.expiresAt)>new Date();
    return `<article class="owner-security-row" data-session="${escapeHtml(session.id)}">
      <div><b>${escapeHtml(session.deviceName||"Άγνωστη συσκευή")}${session.current?" · ΑΥΤΗ Η ΣΥΣΚΕΥΗ":""}</b><br><span>Τελευταία χρήση: ${escapeHtml(dateTime(session.lastSeenAt))}</span><br><small>IP: ${escapeHtml(session.ipAddress||"—")} · Λήξη: ${escapeHtml(dateTime(session.expiresAt))}</small></div>
      <span class="owner-security-state ${active?"":"off"}">${active?"ΕΝΕΡΓΗ":"ΚΛΕΙΣΤΗ"}</span>
      ${active?`<button data-revoke="${escapeHtml(session.id)}" data-current="${session.current?"1":"0"}">${session.current?"Αποσύνδεση":"Ανάκληση"}</button>`:""}
    </article>`;
  }).join("");
  const audits=(data.audits||[]).map(item=>`<article class="owner-security-row"><div><b>${escapeHtml(eventLabels[item.event]||item.event)}</b><br><span>${escapeHtml(item.deviceName||"Άγνωστη συσκευή")} · ${escapeHtml(item.ipAddress||"—")}</span></div><span>${item.success?"ΕΠΙΤΥΧΙΑ":"ΑΠΟΤΥΧΙΑ"}</span><small>${escapeHtml(dateTime(item.createdAt))}</small></article>`).join("");
  const root=modalShell(`<div class="owner-security-head"><h2>Ασφάλεια λογαριασμού</h2><p>Έλεγχος δύο βημάτων, συνδεδεμένες συσκευές και ιστορικό εισόδων.</p></div>
    <div class="owner-security-summary"><article><b>Έλεγχος δύο βημάτων</b><span>${data.totpEnabled?"Ενεργός":"Ανενεργός"}</span></article><article><b>Κωδικοί ανάκτησης</b><span>${data.recoveryCount||0} διαθέσιμοι</span></article><article><b>Συνδεδεμένες συσκευές</b><span>${(data.sessions||[]).filter(s=>!s.revokedAt&&new Date(s.expiresAt)>new Date()).length} ενεργές</span></article></div>
    <div class="owner-security-actions"><button data-toggle>${data.totpEnabled?"Απενεργοποίηση 2FA":"Ενεργοποίηση 2FA"}</button><button class="secondary" data-others>Αποσύνδεση άλλων συσκευών</button><button class="secondary" data-refresh>Ανανέωση</button></div>
    <section class="owner-security-section"><h3>Συνδεδεμένες συσκευές</h3><div class="owner-security-list">${sessions||"<div>Δεν υπάρχουν συσκευές.</div>"}</div></section>
    <section class="owner-security-section"><h3>Ιστορικό εισόδων</h3><div class="owner-security-list">${audits||"<div>Δεν υπάρχουν εγγραφές.</div>"}</div></section>`);
  root.querySelector("[data-toggle]").addEventListener("click",()=>data.totpEnabled?showDisable(root):startSetup(root));
  root.querySelector("[data-refresh]").addEventListener("click",()=>{root.remove();openSecurityCenter()});
  root.querySelector("[data-others]").addEventListener("click",async()=>{await nativeRequest("/api/auth/owner/sessions/revoke-others",{method:"POST",body:"{}"});root.remove();openSecurityCenter()});
  root.querySelectorAll("[data-revoke]").forEach(button=>button.addEventListener("click",async()=>{
    const result=await nativeRequest(`/api/auth/owner/sessions/${button.dataset.revoke}/revoke`,{method:"POST",body:"{}"});
    if(result.current){clearSession();return}
    root.remove();openSecurityCenter();
  }));
}

function refreshLauncher(){
  const user=readUser();
  const shouldShow=user?.role==="OWNER"&&!user?.mfaRequired&&!user?.mustChangePassword;
  let button=document.getElementById("owner-security-launcher");
  if(!shouldShow){button?.remove();return}
  if(button)return;
  ensureStyles();
  button=document.createElement("button");
  button.id="owner-security-launcher";
  button.className="owner-security-launcher";
  button.textContent="Ασφάλεια λογαριασμού";
  button.addEventListener("click",openSecurityCenter);
  document.body.appendChild(button);
}

export function installOwnerAccountSecurity(){
  if(window.__ownerAccountSecurityInstalled)return;
  window.__ownerAccountSecurityInstalled=true;
  const originalFetch=window.fetch.bind(window);
  window.__ownerSecurityNativeFetch=originalFetch;

  window.fetch=async(input,init={})=>{
    const requestUrl=typeof input==="string"?input:input?.url||"";
    const url=new URL(requestUrl,location.origin);
    const user=readUser();
    const allowed=url.pathname.startsWith("/api/auth/");
    if(user?.role==="OWNER"&&user?.mfaRequired&&!allowed){
      return new Response(JSON.stringify(fallbackFor(url.pathname)),{status:200,headers:{"Content-Type":"application/json"}});
    }
    const response=await originalFetch(input,init);
    if(url.pathname==="/api/auth/login"&&response.ok){
      response.clone().json().then(result=>{if(result?.user?.mfaRequired)setTimeout(showMfaGate,0)}).catch(()=>{});
    }
    return response;
  };

  const refresh=()=>{showMfaGate();refreshLauncher()};
  refresh();
  const timer=setInterval(refresh,400);
  window.addEventListener("beforeunload",()=>clearInterval(timer),{once:true});
}
