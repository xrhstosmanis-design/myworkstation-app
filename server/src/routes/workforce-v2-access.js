import {requireStaffGrant,staffError} from '../services/backoffice-staff-access.js';
import {staffRequestCapability} from '../../../shared/backoffice-staff.mjs';
import {prisma} from "../prisma.js";
import {PERSONNEL_BASIC,isSuperAdmin,requirePersonnelPackage,storePaidModuleState,storePaidModuleStates} from "../store-paid-modules.js";
import {serializeWorkforceRule} from "../workforce-v2-rules.js";

export const managementRoles=new Set(["OWNER","ADMIN","MANAGER"]);
export const employeeInclude={
  roleAssignments:{include:{role:true},orderBy:[{primary:"desc"},{createdAt:"asc"}]},
  storeAccess:{orderBy:[{isBaseStore:"desc"},{createdAt:"asc"}]},
  rules:{orderBy:[{active:"desc"},{createdAt:"asc"}]},
  hourlyRates:{orderBy:{validFrom:"desc"},take:20}
};

export function managementGuard(req,res,next){
  if(req.user?.staffAccess===true){
    const path=String(req.originalUrl||'').split('?')[0];
    const capability=staffRequestCapability(req.method,path,req.body);
    if(['employees.read','schedule.read','schedule.create','attendance.read','attendance.correct','attendance.approve-review','attendance.approve-overtime','leaves.read','leaves.create','leaves.approve','leaves.reject','leaves.cancel','payroll.read','shift-templates.manage','workforce-rules.manage'].includes(capability)&&req.staffGrant?.capability===capability&&req.params.companyId===req.user.companyId&&req.params.storeId===req.user.storeId)return next();
    return res.status(403).json({error:'Δεν υπάρχει δικαίωμα προβολής προσωπικού.'});
  }
  if(isSuperAdmin(req.user)||managementRoles.has(req.user?.role))return next();
  return res.status(403).json({error:"Απαιτείται δικαίωμα Super Admin, Owner, Admin ή Manager."});
}

export function cleanText(value){
  const text=String(value??"").trim();
  return text||null;
}

function jsonSafe(value){
  if(value===undefined)return undefined;
  return JSON.parse(JSON.stringify(value));
}

function requestIp(req){
  const forwarded=req.headers?.["x-forwarded-for"];
  if(typeof forwarded==="string")return forwarded.split(",")[0].trim().slice(0,120)||null;
  return String(req.ip||req.socket?.remoteAddress||"").slice(0,120)||null;
}

export async function audit(tx,req,{companyId,storeId=null,action,entityType,entityId=null,before=null,after=null,reason=null}){
  await tx.workforceAuditLog.create({data:{
    companyId,storeId,actorUserId:req.user?.id||null,action,entityType,entityId,
    ...(before!==null?{beforeJson:jsonSafe(before)}:{}),
    ...(after!==null?{afterJson:jsonSafe(after)}:{}),
    reason:cleanText(reason),deviceName:cleanText(req.headers?.["x-device-name"]),
    userAgent:cleanText(req.headers?.["user-agent"]),ipAddress:requestIp(req)
  }});
}

export async function contextFor(req){
  const companyId=String(req.params.companyId||"");
  const storeId=String(req.params.storeId||"");
  if(!companyId||!storeId)throw Object.assign(new Error("Δεν προσδιορίστηκε ιδιοκτήτης ή κατάστημα."),{status:400});
  if(!isSuperAdmin(req.user)&&String(req.user?.companyId||"")!==companyId)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});
  if(req.user?.staffAccess===true){
    const capability=req.staffGrant?.capability;
    if(req.user.storeId!==storeId||!['employees.read','schedule.read','schedule.create','attendance.read','attendance.correct','attendance.approve-review','attendance.approve-overtime','leaves.read','leaves.create','leaves.approve','leaves.reject','leaves.cancel','payroll.read','shift-templates.manage','workforce-rules.manage'].includes(capability))throw staffError();
    await requireStaffGrant(prisma,req.user,storeId,capability);
    const [store,company]=await Promise.all([
      prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,name:true,companyId:true}}),
      prisma.company.findUnique({where:{id:companyId},select:{id:true,name:true,active:true}})
    ]);
    if(!store||!company?.active)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε το κατάστημα.');
    return {company,store};
  }
  const access=await requirePersonnelPackage(req,storeId,PERSONNEL_BASIC);
  if(String(access.store.companyId)!==companyId)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});
  const company=await prisma.company.findUnique({where:{id:companyId},select:{id:true,name:true,active:true}});
  if(!company)throw Object.assign(new Error("Δεν βρέθηκε ο ιδιοκτήτης."),{status:404});
  return {company,store:access.store,packageAccess:access};
}

export async function storesForContext(req,companyId){
  const stores=await prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true,city:true,active:true},orderBy:{name:"asc"}});
  const withStates=await Promise.all(stores.map(async store=>{
    const state=await storePaidModuleState(store.id,PERSONNEL_BASIC);
    return {...store,personnelBasicActive:Boolean(state.effectiveActive),personnelBasicInheritedFrom:state.inheritedFrom||null};
  }));
  return isSuperAdmin(req.user)?withStates:withStates.filter(store=>store.personnelBasicActive);
}

export async function accessibleStoreIds(req,companyId){
  const stores=await storesForContext(req,companyId);
  return {stores,ids:stores.map(store=>store.id)};
}

export async function rolesForCompany(companyId,{includeInactive=true}={}){
  return prisma.workforceRole.findMany({
    where:{companyId,...(includeInactive?{}:{active:true})},
    include:{_count:{select:{employeeAssignments:true,requiredByTemplates:true}}},
    orderBy:[{active:"desc"},{name:"asc"}]
  });
}

export function serializeRole(role){
  return {
    id:role.id,companyId:role.companyId,name:role.name,code:role.code,description:role.description||null,active:role.active,
    employeeCount:Number(role._count?.employeeAssignments||0),shiftTemplateCount:Number(role._count?.requiredByTemplates||0),
    createdAt:role.createdAt,updatedAt:role.updatedAt
  };
}

export function serializeEmployee(employee,storeMap=new Map()){
  const roles=(employee.roleAssignments||[]).map(assignment=>({
    id:assignment.role.id,name:assignment.role.name,code:assignment.role.code,active:assignment.role.active,primary:Boolean(assignment.primary)
  }));
  const storeAccess=(employee.storeAccess||[]).map(access=>({
    id:access.id,storeId:access.storeId,storeName:storeMap.get(access.storeId)?.name||null,
    isBaseStore:Boolean(access.isBaseStore),canSchedule:Boolean(access.canSchedule),active:Boolean(access.active)
  }));
  const hourlyRates=(employee.hourlyRates||[]).map(rate=>({
    id:rate.id,hourlyRate:Number(rate.hourlyRate),validFrom:rate.validFrom,validTo:rate.validTo,note:rate.note||null
  }));
  const rules=(employee.rules||[]).map(rule=>serializeWorkforceRule(rule,{employeeName:employee.fullName}));
  return {
    id:employee.id,companyId:employee.companyId,baseStoreId:employee.baseStoreId||null,
    baseStoreName:storeMap.get(employee.baseStoreId)?.name||null,userId:employee.userId||null,
    legacyEmployeeId:employee.legacyEmployeeId||null,fullName:employee.fullName,phone:employee.phone||null,email:employee.email||null,
    hasPin:Boolean(employee.pinHash),
    paymentType:employee.paymentType,
    dailyRate:employee.dailyRate===null||employee.dailyRate===undefined?null:Number(employee.dailyRate),
    fixedMonthlyAmount:employee.fixedMonthlyAmount===null||employee.fixedMonthlyAmount===undefined?null:Number(employee.fixedMonthlyAmount),
    maxDaysPerWeek:employee.maxDaysPerWeek,maxHoursPerWeek:Number(employee.maxHoursPerWeek),minimumDaysOff:employee.minimumDaysOff,
    canChangeStore:employee.canChangeStore,worksMorning:employee.worksMorning,worksAfternoon:employee.worksAfternoon,
    worksNight:employee.worksNight,worksWeekend:employee.worksWeekend,notes:employee.notes||null,active:employee.active,
    roles,primaryRole:roles.find(role=>role.primary)||null,storeAccess,rules,
    currentHourlyRate:hourlyRates.find(rate=>!rate.validTo)||hourlyRates[0]||null,hourlyRates,
    createdAt:employee.createdAt,updatedAt:employee.updatedAt
  };
}

export function employeeReadSelection(storeId,companyId){
  return {
    id:true,companyId:true,baseStoreId:true,fullName:true,phone:true,email:true,active:true,
    maxDaysPerWeek:true,maxHoursPerWeek:true,minimumDaysOff:true,worksMorning:true,worksAfternoon:true,worksNight:true,worksWeekend:true,
    createdAt:true,updatedAt:true,
    roleAssignments:{where:{role:{companyId}},select:{primary:true,role:{select:{id:true,name:true,code:true,active:true}}},orderBy:[{primary:'desc'},{createdAt:'asc'}]},
    storeAccess:{where:{storeId,active:true},select:{id:true,storeId:true,isBaseStore:true,canSchedule:true,active:true}}
  };
}

export function serializeEmployeeRead(employee,store){
  const roles=(employee.roleAssignments||[]).map(({role,primary})=>({...role,primary:Boolean(primary)}));
  return {
    id:employee.id,companyId:employee.companyId,fullName:employee.fullName,phone:employee.phone||null,email:employee.email||null,active:employee.active,
    baseStoreId:employee.baseStoreId===store.id?store.id:null,baseStoreName:employee.baseStoreId===store.id?store.name:null,
    roles,primaryRole:roles.find(role=>role.primary)||null,
    storeAccess:(employee.storeAccess||[]).filter(access=>access.storeId===store.id).map(access=>({...access,storeName:store.name})),
    maxDaysPerWeek:employee.maxDaysPerWeek,maxHoursPerWeek:Number(employee.maxHoursPerWeek),minimumDaysOff:employee.minimumDaysOff,
    worksMorning:employee.worksMorning,worksAfternoon:employee.worksAfternoon,worksNight:employee.worksNight,worksWeekend:employee.worksWeekend,
    createdAt:employee.createdAt,updatedAt:employee.updatedAt
  };
}

export async function loadEmployee(req,context,employeeId){
  const delegated=req.user?.staffAccess===true;
  const scope=delegated?{ids:[context.store.id]}:isSuperAdmin(req.user)?{}:await accessibleStoreIds(req,context.company.id);
  const employee=await prisma.workforceEmployee.findFirst({
    where:{
      id:String(employeeId),companyId:context.company.id,
      ...(isSuperAdmin(req.user)?{}:{OR:[{baseStoreId:{in:scope.ids}},{storeAccess:{some:{storeId:{in:scope.ids},active:true}}}]})
    },
    ...(delegated?{select:employeeReadSelection(context.store.id,context.company.id)}:{include:employeeInclude})
  });
  if(!employee)throw Object.assign(new Error("Δεν βρέθηκε εργαζόμενος Workforce v2."),{status:404});
  return employee;
}

export async function employeeResponse(companyId,employeeId){
  const [employee,stores]=await Promise.all([
    prisma.workforceEmployee.findFirst({where:{id:employeeId,companyId},include:employeeInclude}),
    prisma.store.findMany({where:{companyId},select:{id:true,name:true}})
  ]);
  if(!employee)return null;
  return serializeEmployee(employee,new Map(stores.map(store=>[store.id,store])));
}

export {PERSONNEL_BASIC,isSuperAdmin,storePaidModuleStates};
