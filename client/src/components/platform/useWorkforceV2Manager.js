import {useEffect,useMemo,useState} from "react";
import {
  emptyWorkforceEmployee,emptyWorkforceRule,emptyWorkforceShiftTemplate,workforceDateInput,workforceToday
} from "./workforce-v2-ui-utils.js";

export default function useWorkforceV2Manager({company,store,request}){
  const[tab,setTab]=useState("employees"),[data,setData]=useState(null),[form,setForm]=useState(()=>emptyWorkforceEmployee(store?.id));
  const[editingId,setEditingId]=useState(null),[roleForm,setRoleForm]=useState({name:"",code:"",description:""}),[roleEditingId,setRoleEditingId]=useState(null);
  const[ruleForm,setRuleForm]=useState(()=>emptyWorkforceRule()),[ruleEditingId,setRuleEditingId]=useState(null);
  const[shiftForm,setShiftForm]=useState(()=>emptyWorkforceShiftTemplate()),[shiftEditingId,setShiftEditingId]=useState(null);
  const[pending,setPending]=useState(null),[migration,setMigration]=useState(null),[migrationScope,setMigrationScope]=useState("STORE"),[includeInactiveLegacy,setIncludeInactiveLegacy]=useState(false);
  const[busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
  const base=`/api/platform/store-modules/companies/${company.id}/stores/${store.id}/workforce-v2`;
  const activeRoles=useMemo(()=>data?.roles?.filter(role=>role.active)||[],[data]);
  const storeMap=useMemo(()=>new Map((data?.stores||[]).map(item=>[item.id,item])),[data]);
  const roleMap=useMemo(()=>new Map((data?.roles||[]).map(item=>[item.id,item])),[data]);
  const employeeMap=useMemo(()=>new Map((data?.employees||[]).map(item=>[item.id,item])),[data]);
  const ruleDefinitionMap=useMemo(()=>new Map((data?.ruleDefinitions||[]).map(item=>[item.type,item])),[data]);
  const shiftCategoryMap=useMemo(()=>new Map((data?.shiftCategories||[]).map(item=>[item.code,item])),[data]);

  const load=async()=>{
    setBusy("load");setError("");
    try{
      const result=await request(`${base}/bootstrap`);setData(result);
      setForm(current=>current.baseStoreId?current:emptyWorkforceEmployee(result.contextStore?.id||store.id));
      setRuleForm(current=>current.employeeId?current:emptyWorkforceRule(result.employees?.find(employee=>employee.active)?.id||""));
    }catch(e){setError(e.message)}finally{setBusy("")}
  };
  useEffect(()=>{
    setForm(emptyWorkforceEmployee(store?.id));setEditingId(null);setRoleForm({name:"",code:"",description:""});setRoleEditingId(null);
    setRuleForm(emptyWorkforceRule());setRuleEditingId(null);setShiftForm(emptyWorkforceShiftTemplate());setShiftEditingId(null);
    setMigration(null);setPending(null);load();
  },[company?.id,store?.id]);

  const resetEmployee=()=>{setEditingId(null);setForm(emptyWorkforceEmployee(store.id));setPending(null)};
  const resetRole=()=>{setRoleEditingId(null);setRoleForm({name:"",code:"",description:""});setPending(null)};
  const resetRule=()=>{setRuleEditingId(null);setRuleForm(emptyWorkforceRule(data?.employees?.find(employee=>employee.active)?.id||""));setPending(null)};
  const resetShiftTemplate=()=>{setShiftEditingId(null);setShiftForm(emptyWorkforceShiftTemplate());setPending(null)};
  const setField=(key,value)=>setForm(current=>({...current,[key]:value}));
  const setRuleField=(key,value)=>setRuleForm(current=>({...current,[key]:value}));
  const setShiftField=(key,value)=>setShiftForm(current=>({...current,[key]:value}));
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
      pin:"",
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
    notes:form.notes.trim()||null,pin:form.pin.trim()||null,roleIds:form.roleIds,primaryRoleId:form.primaryRoleId,
    storeAccess:[...new Set([form.baseStoreId,...form.storeIds])].map(storeId=>({storeId,canSchedule:true}))
  });
  const previewEmployee=()=>{
    setError("");setMessage("");
    if(!form.fullName.trim())return setError("Συμπλήρωσε ονοματεπώνυμο.");
    if(!form.baseStoreId)return setError("Επίλεξε κατάστημα βάσης.");
    if(!form.roleIds.length||!form.primaryRoleId)return setError("Επίλεξε τουλάχιστον έναν ρόλο και κύριο ρόλο.");
    if(form.paymentType==="HOURLY"&&!(Number(form.hourlyRate)>0))return setError("Συμπλήρωσε έγκυρο ωρομίσθιο.");
    if(form.paymentType==="FIXED_MONTHLY"&&!(Number(form.fixedMonthlyAmount)>0))return setError("Συμπλήρωσε σταθερό μηνιαίο ποσό.");
    if(form.pin.trim()&&!/^\d{4,8}$/.test(form.pin.trim()))return setError("Ο PIN πρέπει να έχει 4 έως 8 ψηφία.");
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

  const chooseRuleType=ruleType=>{
    const definition=ruleDefinitionMap.get(ruleType);
    setRuleForm(current=>({...current,ruleType,severity:definition?.defaultSeverity||"ERROR",relatedEmployeeId:"",numericValue:""}));
  };
  const editRule=rule=>{
    const definition=ruleDefinitionMap.get(rule.ruleType);
    setRuleEditingId(rule.id);
    setRuleForm({
      employeeId:rule.employeeId,ruleType:rule.ruleType,severity:rule.severity||definition?.defaultSeverity||"ERROR",
      relatedEmployeeId:rule.relatedEmployeeId||"",
      numericValue:definition?.valueKind==="NUMBER_DAYS_OFF"?String(rule.value?.days??""):definition?.valueKind==="NUMBER_HOURS"?String(rule.value?.hours??""):"",
      validFrom:workforceDateInput(rule.validFrom),validTo:workforceDateInput(rule.validTo),note:rule.note||""
    });
    setTab("rules");setPending(null);setMessage("");setError("");
  };
  const rulePayload=()=>{
    const definition=ruleDefinitionMap.get(ruleForm.ruleType);
    const value=definition?.valueKind==="NUMBER_DAYS_OFF"?{days:Number(ruleForm.numericValue)}:definition?.valueKind==="NUMBER_HOURS"?{hours:Number(ruleForm.numericValue)}:{};
    return {
      employeeId:ruleForm.employeeId,ruleType:ruleForm.ruleType,severity:ruleForm.severity,
      relatedEmployeeId:definition?.valueKind==="RELATED_EMPLOYEE"?(ruleForm.relatedEmployeeId||null):null,value,
      note:ruleForm.note.trim()||null,
      validFrom:ruleForm.validFrom?new Date(`${ruleForm.validFrom}T00:00:00`).toISOString():null,
      validTo:ruleForm.validTo?new Date(`${ruleForm.validTo}T23:59:59.999`).toISOString():null
    };
  };
  const previewRule=()=>{
    setError("");setMessage("");
    const definition=ruleDefinitionMap.get(ruleForm.ruleType);
    if(!ruleForm.employeeId)return setError("Επίλεξε εργαζόμενο.");
    if(definition?.valueKind==="RELATED_EMPLOYEE"&&!ruleForm.relatedEmployeeId)return setError("Επίλεξε το άτομο που δεν πρέπει να βρίσκεται στην ίδια βάρδια.");
    if(definition?.valueKind==="NUMBER_DAYS_OFF"&&(!Number.isInteger(Number(ruleForm.numericValue))||Number(ruleForm.numericValue)<1||Number(ruleForm.numericValue)>6))return setError("Τα ελάχιστα ρεπό πρέπει να είναι από 1 έως 6.");
    if(definition?.valueKind==="NUMBER_HOURS"&&(!(Number(ruleForm.numericValue)>=1)||Number(ruleForm.numericValue)>168))return setError("Οι μέγιστες ώρες πρέπει να είναι από 1 έως 168.");
    if(ruleForm.validFrom&&ruleForm.validTo&&ruleForm.validTo<ruleForm.validFrom)return setError("Η λήξη του κανόνα δεν μπορεί να είναι πριν από την έναρξη.");
    setPending({type:"rule",payload:rulePayload(),reason:ruleEditingId?"Ενημέρωση κανόνα εργαζομένου":"Δημιουργία κανόνα εργαζομένου"});
  };
  const confirmRule=async()=>{
    setBusy("rule-save");setError("");
    try{
      const endpoint=ruleEditingId?`${base}/rules/${ruleEditingId}`:`${base}/rules`;
      await request(endpoint,{method:ruleEditingId?"PUT":"POST",body:JSON.stringify({...pending.payload,confirmed:true,reason:pending.reason})});
      setMessage(ruleEditingId?"Ο κανόνας εργαζομένου ενημερώθηκε.":"Ο κανόνας εργαζομένου δημιουργήθηκε.");resetRule();await load();
    }catch(e){setError(e.message)}finally{setBusy("")}
  };
  const changeRuleStatus=async rule=>{
    const next=!rule.active,reason=window.prompt(`${next?"Ενεργοποίηση":"Απενεργοποίηση"} κανόνα. Γράψε τον λόγο:`);
    if(!reason||reason.trim().length<3)return;
    setBusy(`rule-${rule.id}`);setError("");
    try{await request(`${base}/rules/${rule.id}/status`,{method:"PATCH",body:JSON.stringify({active:next,confirmed:true,reason:reason.trim()})});setMessage(next?"Ο κανόνας ενεργοποιήθηκε.":"Ο κανόνας απενεργοποιήθηκε χωρίς διαγραφή.");await load()}
    catch(e){setError(e.message)}finally{setBusy("")}
  };

  const chooseShiftCategory=category=>{
    const definition=shiftCategoryMap.get(category);
    setShiftForm(current=>({...current,category,...(!shiftEditingId&&definition?{name:definition.label,startTime:definition.defaultStartTime,endTime:definition.defaultEndTime}:{})}));
  };
  const editShiftTemplate=template=>{
    setShiftEditingId(template.id);
    setShiftForm({
      name:template.name||"",code:template.code||"",category:template.category||"CUSTOM",startTime:template.startTime||"09:00",endTime:template.endTime||"17:00",
      minimumPeople:String(template.minimumPeople??1),maximumPeople:template.maximumPeople===null||template.maximumPeople===undefined?"":String(template.maximumPeople),
      requiredRoleId:template.requiredRoleId||"",requiresSupervisor:Boolean(template.requiresSupervisor),changeAllowed:Boolean(template.changeAllowed)
    });
    setTab("shifts");setPending(null);setMessage("");setError("");
  };
  const shiftTemplatePayload=()=>({
    name:shiftForm.name.trim(),code:shiftForm.code.trim()||undefined,category:shiftForm.category,startTime:shiftForm.startTime,endTime:shiftForm.endTime,
    minimumPeople:Number(shiftForm.minimumPeople),maximumPeople:shiftForm.maximumPeople===""?null:Number(shiftForm.maximumPeople),
    requiredRoleId:shiftForm.requiredRoleId||null,requiresSupervisor:Boolean(shiftForm.requiresSupervisor),changeAllowed:Boolean(shiftForm.changeAllowed)
  });
  const previewShiftTemplate=()=>{
    setError("");setMessage("");
    if(shiftForm.name.trim().length<2)return setError("Συμπλήρωσε ονομασία βάρδιας.");
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftForm.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftForm.endTime))return setError("Συμπλήρωσε σωστές ώρες έναρξης και λήξης.");
    if(!(Number(shiftForm.minimumPeople)>=1))return setError("Τα ελάχιστα άτομα πρέπει να είναι τουλάχιστον 1.");
    if(shiftForm.maximumPeople!==""&&Number(shiftForm.maximumPeople)<Number(shiftForm.minimumPeople))return setError("Τα μέγιστα άτομα δεν μπορεί να είναι λιγότερα από τα ελάχιστα.");
    setPending({type:"shiftTemplate",payload:shiftTemplatePayload(),reason:shiftEditingId?"Ενημέρωση προτύπου βάρδιας":"Δημιουργία προτύπου βάρδιας"});
  };
  const confirmShiftTemplate=async()=>{
    setBusy("shift-save");setError("");
    try{
      const endpoint=shiftEditingId?`${base}/shift-templates/${shiftEditingId}`:`${base}/shift-templates`;
      await request(endpoint,{method:shiftEditingId?"PUT":"POST",body:JSON.stringify({...pending.payload,confirmed:true,reason:pending.reason})});
      setMessage(shiftEditingId?"Το πρότυπο βάρδιας ενημερώθηκε.":"Το πρότυπο βάρδιας δημιουργήθηκε.");resetShiftTemplate();await load();
    }catch(e){setError(e.message)}finally{setBusy("")}
  };
  const changeShiftTemplateStatus=async template=>{
    const next=!template.active,reason=window.prompt(`${next?"Ενεργοποίηση":"Απενεργοποίηση"} βάρδιας «${template.name}». Γράψε τον λόγο:`);
    if(!reason||reason.trim().length<3)return;
    setBusy(`shift-${template.id}`);setError("");
    try{await request(`${base}/shift-templates/${template.id}/status`,{method:"PATCH",body:JSON.stringify({active:next,confirmed:true,reason:reason.trim()})});setMessage(next?"Η βάρδια ενεργοποιήθηκε.":"Η βάρδια απενεργοποιήθηκε χωρίς διαγραφή.");await load()}
    catch(e){setError(e.message)}finally{setBusy("")}
  };

  const createMigrationPreview=async()=>{
    setBusy("migration");setError("");setMessage("");
    try{setMigration(await request(`${base}/migration/preview`,{method:"POST",body:JSON.stringify({scope:migrationScope,includeInactive:includeInactiveLegacy})}))}
    catch(e){setError(e.message)}finally{setBusy("")}
  };

  return {
    tab,setTab,data,form,setForm,editingId,roleForm,setRoleForm,roleEditingId,ruleForm,setRuleForm,ruleEditingId,shiftForm,setShiftForm,shiftEditingId,
    pending,setPending,migration,setMigration,migrationScope,setMigrationScope,includeInactiveLegacy,setIncludeInactiveLegacy,busy,error,message,
    activeRoles,storeMap,roleMap,employeeMap,ruleDefinitionMap,shiftCategoryMap,load,resetEmployee,resetRole,resetRule,resetShiftTemplate,
    setField,setRuleField,setShiftField,chooseBaseStore,toggleStore,toggleRole,editEmployee,previewEmployee,confirmEmployee,changeEmployeeStatus,
    editRole,previewRole,confirmRole,changeRoleStatus,chooseRuleType,editRule,previewRule,confirmRule,changeRuleStatus,
    chooseShiftCategory,editShiftTemplate,previewShiftTemplate,confirmShiftTemplate,changeShiftTemplateStatus,createMigrationPreview
  };
}
