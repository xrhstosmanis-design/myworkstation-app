import {installManagementVatSuite} from "./components/commerce/installManagementVatSuite.js";

const api=async(path,options={})=>{const token=localStorage.getItem("token");const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data};
const install=()=>installManagementVatSuite(api);
const schedule=()=>[0,60,180,400,800].forEach(ms=>window.setTimeout(install,ms));
schedule();
document.addEventListener("click",schedule,true);
window.addEventListener("myworkstation:modules-updated",schedule);
