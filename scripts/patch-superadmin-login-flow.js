import fs from "node:fs";

const path="client/src/main.jsx";
const source=fs.readFileSync(path,"utf8");
const before='const submit=async e=>{e.preventDefault();try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});localStorage.setItem("token",d.token);localStorage.setItem("user",JSON.stringify(d.user));onLogin(d.user)}catch(x){setError(x.message)}};';
const after='const submit=async e=>{e.preventDefault();try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});if(d.setupRequired||d.mfaRequired||d.user?.role==="SUPER_ADMIN"){localStorage.removeItem("token");localStorage.removeItem("user");window.location.replace("/platform-admin");return}localStorage.setItem("token",d.token);localStorage.setItem("user",JSON.stringify(d.user));onLogin(d.user)}catch(x){setError(x.message)}};';

if(source.includes(after)){
  console.log("[build] Super Admin secure-login routing already patched");
  process.exit(0);
}
if(!source.includes(before)){
  throw new Error("Expected login submit handler not found; refusing unsafe patch");
}
fs.writeFileSync(path,source.replace(before,after));
console.log("[build] Super Admin login now routes to /platform-admin secure 2FA flow");
