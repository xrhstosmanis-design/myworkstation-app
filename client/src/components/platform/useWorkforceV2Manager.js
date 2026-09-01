import {useEffect,useMemo,useState} from "react";
import {emptyWorkforceEmployee,workforceToday} from "./workforce-v2-ui-utils.js";

export default function useWorkforceV2Manager({company,store,request}){
  const[tab,setTab]=useState("employees"),[data,setData]=useState(null),[form,setForm]=useState(()=>emptyWorkforceEmployee(store?.id));
  const[editingId,setEditingId]=useState(null),[roleForm,setRoleForm]=useState({name:"",code:"",description:""}),[roleEditingId,setRoleEditingId]=useState(null);
  const[pending,setPending]=useState(null),[migration,setMigration]=useState(null),[migrationScope,setMigrationScope]=useState("STORE"),[includeInactiveLegacy,setIncludeInactiveLegacy]=useState(false);
  const[busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
  const base=`/api/platform/store-modules/companies/${company.id}/stores/${store.id}/workforce-v2`;
  const activeRoles=useMemo(()=>data?.roles?.filter(role=>role.active)||[],[data]);
  const storeMap=useMemo(()=>new Map((data?.stores||[]).map(item=>[item.id,item])),[data]);
  const roleMap=useMemo(()=>new Map((data?.roles||[]).map(item=>[item.id,item])),[data]);

  const load=async()=>{
    setBusy("load");setError("");
    try{
      const result=await request(`${base}/bootstrap`);setData(result);
      setForm(current=>current.baseStoreId?current:emptyWorkforceEmployee(result.contextStore?.id||store.id));
    }catch(e){setError(e.message)}finally{setBusy("")}
  };
  useEffect(()=>{setForm(emptyWorkforceEmployee(store?.id));setEditingId(null);setMigration(null);load()},[company?.id,store?.id]);

  const resetEmployee=()=>{setEditingId(null);setForm(emptyWorkforceEmployee(store.id));setPending(null)};
  const resetRole=()=>{setRoleEditingId(null);setRoleForm({name:"",code:"",description:""});setPending(null)};
  const setField=(key,value)=>setForm(current=>({...current,[key]:value}));
  const chooseBaseStore=storeId=>setForm(current=>({...current,baseStoreId:storeId,storeIds:current.canChangeStore?[...new Set([storeId,...current.storeIds])]:[storeId]}));
  const toggleStore=storeId=>setForm(current=>storeId===current.baseStoreId?current:{...current,storeIds:current.storeIds.includes(storeId)?current.storeIds.filter(id=>id!==storeId):[...current.storeIds,storeId]});
  const toggleRole=roleId=>setForm(current=>{
    const roleIds=current.roleIds.includes(roleId)?current.roleIds.filter(id=>id!==roleId):[...current.roleIds,roleId];
    return {...current,roleIds,primaryRoleId:roleIds.includes(current.primaryRoleId)?current.primaryRoleId:(roleIds[0]||"")};
  });

  const editEmployee=employee=>{
    const accessIds=employee.storeAccess.filter(access=>access.active).map(access=>access.storeId),activeEmployeeRoles=employee.roles.filter(role=>role.active);
    setEditingId(employee.id);
    setForm({
      fullName:employee.fullName||"",phone:employee.phone||"",email:employee.email||"",baseStoreId:employee.baseStoreId||store.id,
      paymentType:employee.paymentType||"HOURLY",hourlyRate:employee.currentHourlyRate?.hourlyRate??"",fixedMonthlyAmount:employee.fixedMonthlyAmount??"",
      effectiveFrom:workforceToday(),maxDaysPerWeek:String(employee.maxDaysPerWeek??5),maxHoursPerWeek:String(employee.maxHoursPerWeek??40),minimumDaysOff:String(employee.minimumDaysOff??1),
      canChangeStore:Boolean(employee.canChangeStore),worksMorning:Boolean(employee.worksMorning),worksAfternoon:Boolean(employee.worksAfternoon),worksNight:Boolean(employee.worksNight),worksWeekend:Boolean(employee.worksWeekend),
      notes:employee.notes||"",roleIds:activeEmployeeRoles.map(role=>role.id),primaryRoleId:activeEmployeeRoles.find(role=>role.primary)?.id||activeEmployeeRoles[0]?.id||"",
      storeIds:[...new Set([employee.baseStoreId,...accessIds].filter(Boolean))]
    });
    setTab("employees");setPending(null);setMessage("");setError("");
  };

  const employeePayload=()=>({
    fullName:form.fullName.trim(),phone:form.phone.trim()||null,email:form.email.trim()||null,baseStoreId:form.baseStoreId,
    paymentType:form.paymentType,hourlyRate:form.paymentType==="HOURLY"?Number(form.hourlyRate):null,
    fixedMonthlyAmount:form.paymentType==="FIXED_MONTHLY"?Number(form.fixedMonthlyAmount):null,
    effectiveFrom:new Date(`${form.effectiveFrom}T00:00:00`).toISOString(),maxDaysPerWeek:Number(form.maxDaysPerWeek),
    maxHoursPerWeek:Number(form.maxHoursPerWeek),minimumDaysOff:Number(form.minimumDaysOff),canChangeStore:Boolean(form.canChangeStore),
    worksMorning:Boolean(form.worksMorning),worksAfternoon:Boolean(form.worksAfternoon),worksNight:Boolean(form.worksNight),worksWeekend:Boolean(form.worksWeekend),
    notes:form.notes.trim()||null,roleIds:form.roleIds,primaryRoleId:form.primaryRoleId,
    storeAccess:[...new Set([form.baseStoreId,...form.storeIds])].map(storeId=>({storeId,canSchedule:true}))
  });
  const previewEmployee=()=>{
    setError("");setMessage("");
    if(!form.fullName.trim())return setError("Συμπλήρωσε ονοματεπώνυμο.");
    if(!form.baseStoreId)return setError("Επίλεξε κατάστημα βάσης.");
    if(!form.roleIds.length||!form.primaryRoleId)return setError("Επίλεξε τουλάχιστον έναν ρόλο και κύριο ρόλο.");
    if(form.paymentType==="HOURLY"&&!(Number(form.hourlyRate)>0))return setError("Συμπλήρωσε έγκυρο ωρομίσθιο.");
    if(form.paymentType==="FIXED_MONTHLY"&&!(Number(form.fixedMonthlyAmount)>0))return setError("Συμπλήρωσε σταθερό μηνιαίο ποσό.");
    setPending({type:"employee",payload:employeePayload(),reason:editingId?"Ενημέρωση καρτέλας εργαζομένου":"Δημιουργία νέου εργαζομένου"});
  };
  const confirmEmployee=async()=>{
    setBusy("employee-save");setError("");
    try{
      const endpoint=editingId?`${base}/employees/${editingId}`:`${base}/employees`;
      await request(endpoint,{method:editingId?"PUT":"POST",body:JSON.stringify({...pending.payload,confirmed:true,reason:pending.reason})});
      setMessage(editingId?"Η καρτέλα εργαζομένου ενημερώθηκε.":"Ο εργαζόμενος δημιουργήθηκε στο Workforce v2.");resetEmployee();await load();
    }catch(e){setError(e.message)}finally{setBusy("")}
  };
  const changeEmployeeStatus=async employee=>{
    const next=!employee.active,reason=window.prompt(`${next?"Ενεργοποίηση":"Απενεργοποίηση"} εργαζομένου «${employee.fullName}». Γράψε τον λόγο:`);
    if(!reason||reason.trim().length<3)return;
    setBusy(`employee-${employee.id}`);setError("");
    try{
      await request(`${base}/employees/${employee.id}/status`,{method:"PATCH",body:JSON.stringify({active:next,confirmed:true,reason:reason.trim()})});
      setMessage(next?"Ο εργαζόμενος ενεργοποιήθηκε.":"Ο εργαζόμενος απενεργοποιήθηκε χωρίς διαγραφή ιστορικού.");await load();
    }catch(e){setError(e.message)}finally{setBusy("")}
  };

  const editRole=role=>{setRoleEditingId(role.id);setRoleForm({name:role.name||"",code:role.code||"",description:role.description||""});setTab("roles");setPending(null);setMessage("");setError("")};
  const previewRole=()=>{
    setError("");setMessage("");
    if(roleForm.name.trim().length<2)return setError("Συμπλήρωσε όνομα ρόλου.");
    setPending({type:"role",payload:{name:roleForm.name.trim(),code:roleForm.code.trim()||undefined,description:roleForm.description.trim()||null},reason:roleEditingId?"Ενημέρωση ρόλου Workforce v2":"Δημιουργία νέου ρόλου Workforce v2"});
  };
  const confirmRole=async()=>{
    setBusy("role-save");setError("");
    try{
      const endpoint=roleEditingId?`${base}/roles/${roleEditingId}`:`${base}/roles`;
      await request(endpoint,{method:roleEditingId?"PUT":"POST",body:JSON.stringify({...pending.payload,confirmed:true,reason:pending.reason})});
      setMessage(roleEditingId?"Ο ρόλος ενημερώθηκε.":"Ο νέος ρόλος δημιουργήθηκε.");resetRole();await load();
    }catch(e){setError(e.message)}finally{setBusy("")}
  };
  const changeRoleStatus=async role=>{
    const next=!role.active,reason=window.prompt(`${next?"Ενεργοποίηση":"Απενεργοποίηση"} ρόλου «${role.name}». Γράψε τον λόγο:`);
    if(!reason||reason.trim().length<3)return;
    setBusy(`role-${role.id}`);setError("");
    try{await request(`${base}/roles/${role.id}/status`,{method:"PATCH",body:JSON.stringify({active:next,confirmed:true,reason:reason.trim()})});setMessage(next?"Ο ρόλος ενεργοποιήθηκε.":"Ο ρόλος απενεργοποιήθηκε.");await load()}
    catch(e){setError(e.message)}finally{setBusy("")}
  };
  const createMigrationPreview=async()=>{
    setBusy("migration");setError("");setMessage("");
    try{setMigration(await request(`${base}/migration/preview`,{method:"POST",body:JSON.stringify({scope:migrationScope,includeInactive:includeInactiveLegacy})}))}
    catch(e){setError(e.message)}finally{setBusy("")}
  };

  return {tab,setTab,data,form,setForm,editingId,roleForm,setRoleForm,roleEditingId,pending,setPending,migration,setMigration,migrationScope,setMigrationScope,
    includeInactiveLegacy,setIncludeInactiveLegacy,busy,error,message,activeRoles,storeMap,roleMap,load,resetEmployee,resetRole,setField,chooseBaseStore,toggleStore,toggleRole,
    editEmployee,previewEmployee,confirmEmployee,changeEmployeeStatus,editRole,previewRole,confirmRole,changeRoleStatus,createMigrationPreview};
}
