import {workforceRoleCode} from "./workforce-v2-migration.js";

export const WORKFORCE_RULE_DEFINITIONS=Object.freeze([
  Object.freeze({type:"NO_WEEKEND",label:"Δεν δουλεύει Σαββατοκύριακο",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"ONLY_MORNING",label:"Δουλεύει μόνο πρωί",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"ONLY_AFTERNOON",label:"Δουλεύει μόνο απόγευμα",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"ONLY_NIGHT",label:"Δουλεύει μόνο βράδυ",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"NO_MORNING_AFTER_NIGHT",label:"Δεν δουλεύει πρωί μετά από βράδυ",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"MIN_DAYS_OFF",label:"Ελάχιστα ρεπό ανά εβδομάδα",valueKind:"NUMBER_DAYS_OFF",defaultSeverity:"ERROR"}),
  Object.freeze({type:"INCOMPATIBLE_EMPLOYEE",label:"Δεν δουλεύει με συγκεκριμένο άτομο",valueKind:"RELATED_EMPLOYEE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"NEVER_ALONE",label:"Δεν μένει ποτέ μόνος / μόνη στη βάρδια",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"CAN_COVER_OTHER_STORE",label:"Μπορεί να καλύψει άλλο κατάστημα",valueKind:"NONE",defaultSeverity:"WARNING"}),
  Object.freeze({type:"CANNOT_CHANGE_STORE",label:"Δεν μπορεί να αλλάξει κατάστημα",valueKind:"NONE",defaultSeverity:"ERROR"}),
  Object.freeze({type:"DOUBLE_SHIFT_REQUIRES_APPROVAL",label:"Διπλοβάρδια μόνο με έγκριση",valueKind:"NONE",defaultSeverity:"APPROVAL_REQUIRED"}),
  Object.freeze({type:"MAX_HOURS_PER_WEEK",label:"Μέγιστες ώρες ανά εβδομάδα",valueKind:"NUMBER_HOURS",defaultSeverity:"ERROR"})
]);

export const WORKFORCE_RULE_TYPES=Object.freeze(WORKFORCE_RULE_DEFINITIONS.map(item=>item.type));
export const WORKFORCE_RULE_SEVERITIES=Object.freeze(["WARNING","ERROR","APPROVAL_REQUIRED"]);

export const WORKFORCE_SHIFT_CATEGORIES=Object.freeze([
  Object.freeze({code:"MORNING",label:"Πρωί",defaultStartTime:"07:00",defaultEndTime:"15:00"}),
  Object.freeze({code:"AFTERNOON",label:"Απόγευμα",defaultStartTime:"15:00",defaultEndTime:"23:00"}),
  Object.freeze({code:"NIGHT",label:"Βράδυ",defaultStartTime:"23:00",defaultEndTime:"07:00"}),
  Object.freeze({code:"INTERMEDIATE",label:"Ενδιάμεση",defaultStartTime:"11:00",defaultEndTime:"19:00"}),
  Object.freeze({code:"DELIVERY",label:"Delivery",defaultStartTime:"07:00",defaultEndTime:"15:00"}),
  Object.freeze({code:"PRODUCTION",label:"Παραγωγή",defaultStartTime:"07:00",defaultEndTime:"15:00"}),
  Object.freeze({code:"CASHIER",label:"Ταμείο",defaultStartTime:"07:00",defaultEndTime:"15:00"}),
  Object.freeze({code:"CUSTOM",label:"Προσαρμοσμένη",defaultStartTime:"09:00",defaultEndTime:"17:00"})
]);
export const WORKFORCE_SHIFT_CATEGORY_CODES=Object.freeze(WORKFORCE_SHIFT_CATEGORIES.map(item=>item.code));

export function workforceRuleDefinition(ruleType){
  return WORKFORCE_RULE_DEFINITIONS.find(item=>item.type===ruleType)||null;
}

export function normalizeWorkforceRuleValue(ruleType,value={}){
  if(ruleType==="MIN_DAYS_OFF")return {days:Number(value?.days)};
  if(ruleType==="MAX_HOURS_PER_WEEK")return {hours:Number(value?.hours)};
  return {};
}

export function workforceShiftCode(value=""){
  const code=workforceRoleCode(value||"SHIFT");
  return code==="ROLE_REVIEW"?"SHIFT_REVIEW":code;
}

export function serializeWorkforceRule(rule,{employeeName=null,relatedEmployeeName=null}={}){
  return {
    id:rule.id,employeeId:rule.employeeId,employeeName:employeeName||rule.employee?.fullName||null,
    ruleType:rule.ruleType,severity:rule.severity,relatedEmployeeId:rule.relatedEmployeeId||null,
    relatedEmployeeName:relatedEmployeeName||null,value:rule.valueJson&&typeof rule.valueJson==="object"?rule.valueJson:{},
    note:rule.note||null,active:Boolean(rule.active),validFrom:rule.validFrom||null,validTo:rule.validTo||null,
    createdAt:rule.createdAt,updatedAt:rule.updatedAt
  };
}

export function serializeWorkforceShiftTemplate(template){
  const category=WORKFORCE_SHIFT_CATEGORY_CODES.includes(template.category)?template.category:"CUSTOM";
  return {
    id:template.id,companyId:template.companyId,storeId:template.storeId,name:template.name,code:template.code,
    category,legacyCategory:category===template.category?null:template.category,startTime:template.startTime,endTime:template.endTime,
    minimumPeople:Number(template.minimumPeople),maximumPeople:template.maximumPeople===null||template.maximumPeople===undefined?null:Number(template.maximumPeople),
    requiredRoleId:template.requiredRoleId||null,requiredRole:template.requiredRole?{
      id:template.requiredRole.id,name:template.requiredRole.name,code:template.requiredRole.code,active:Boolean(template.requiredRole.active)
    }:null,
    requiresSupervisor:Boolean(template.requiresSupervisor),changeAllowed:Boolean(template.changeAllowed),active:Boolean(template.active),
    assignmentCount:Number(template._count?.assignments||0),createdAt:template.createdAt,updatedAt:template.updatedAt
  };
}
