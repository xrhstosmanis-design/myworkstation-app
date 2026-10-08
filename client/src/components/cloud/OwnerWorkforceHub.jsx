import React,{Suspense,lazy,useState} from "react";
import {Users} from "lucide-react";
import "./owner-workforce.css";

const WorkforceV2EmployeesPanel=lazy(()=>import("../platform/WorkforceV2EmployeesPanel.jsx"));

export default function OwnerWorkforceHub({company,stores,initialStoreId="",request}){
  const available=stores.filter(store=>store.active!==false);
  const [storeId,setStoreId]=useState(()=>available.some(store=>store.id===initialStoreId)?initialStoreId:available.length===1?available[0].id:"");
  const store=available.find(item=>item.id===storeId);
  return <section className="panel owner-workforce">
    <div className="panel-head"><div><h2><Users/> Προσωπικό & Πρόγραμμα</h2><p>Εργαζόμενοι, κάρτες εργασίας και πρόγραμμα του επιλεγμένου καταστήματος.</p></div>
      <label>Κατάστημα<select value={store?.id||""} onChange={event=>setStoreId(event.target.value)}><option value="">Επίλεξε κατάστημα</option>{available.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    {store&&company?.id?<Suspense fallback={<p role="status">Φόρτωση προσωπικού…</p>}><WorkforceV2EmployeesPanel key={`${company.id}:${store.id}`} company={company} store={store} request={request}/></Suspense>:<p>Επίλεξε κατάστημα για να ανοίξεις το προσωπικό του. Απαιτείται ενεργό πακέτο προσωπικού για αυτό το κατάστημα.</p>}
  </section>;
}
