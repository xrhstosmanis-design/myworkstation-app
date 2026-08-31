export const AI_STAFF_SCHEDULER="AI_STAFF_SCHEDULER";
export const PERSONNEL_BASIC="PERSONNEL_BASIC";
export const PERSONNEL_PRO="PERSONNEL_PRO";
export const PERSONNEL_AI="PERSONNEL_AI";
export const PERSONNEL_PAYROLL="PERSONNEL_PAYROLL";

export const PERSONNEL_PACKAGE_KEYS=Object.freeze([
  PERSONNEL_BASIC,
  PERSONNEL_PRO,
  PERSONNEL_AI,
  PERSONNEL_PAYROLL
]);

export const PERSONNEL_WRITABLE_MODULE_KEYS=Object.freeze([
  ...PERSONNEL_PACKAGE_KEYS,
  AI_STAFF_SCHEDULER
]);

export const PERSONNEL_PACKAGE_DEFINITIONS=Object.freeze([
  Object.freeze({
    key:PERSONNEL_BASIC,
    title:"BASIC Προσωπικό",
    shortTitle:"BASIC",
    description:"Εργαζόμενοι, καταστήματα, χειροκίνητο πρόγραμμα, ρεπό, άδειες και PDF/εκτύπωση.",
    includes:Object.freeze(["EMPLOYEES","STORES","MANUAL_SCHEDULE","DAYS_OFF","LEAVE","PRINT"])
  }),
  Object.freeze({
    key:PERSONNEL_PRO,
    title:"PRO Προσωπικό",
    shortTitle:"PRO",
    description:"Όλα του BASIC, κανόνες εργαζομένων, έλεγχος λαθών, αντιγραφή εβδομάδας, προεπισκόπηση και παρουσίες.",
    includes:Object.freeze(["PERSONNEL_BASIC","EMPLOYEE_RULES","VALIDATION","COPY_WEEK","PREVIEW","ATTENDANCE"])
  }),
  Object.freeze({
    key:PERSONNEL_AI,
    title:"AI Προσωπικό",
    shortTitle:"AI",
    description:"Όλα του PRO, βοηθός ChatGPT, αυτόματη πρόταση προγράμματος, διορθώσεις με εντολές και αναλυτικές προειδοποιήσεις.",
    includes:Object.freeze(["PERSONNEL_PRO","CHATGPT_ASSISTANT","AUTO_PROPOSAL","COMMAND_CORRECTIONS","ADVANCED_WARNINGS"])
  }),
  Object.freeze({
    key:PERSONNEL_PAYROLL,
    title:"Payroll / Μισθοδοσία",
    shortTitle:"PAYROLL",
    description:"Ωρομίσθιο, πραγματικές ώρες, πληρωμές υπαλλήλων, υπόλοιπο και κλείσιμο μισθοδοσίας μήνα.",
    includes:Object.freeze(["HOURLY_RATES","ACTUAL_HOURS","EMPLOYEE_PAYMENTS","BALANCES","MONTH_CLOSE"])
  })
]);

function validDate(value){
  if(!value)return null;
  const date=value instanceof Date?value:new Date(value);
  return Number.isNaN(date.getTime())?null:date;
}

export function isPaidModuleRowActive(row,now=new Date()){
  if(!row?.active)return false;
  const startsAt=validDate(row.startsAt),endsAt=validDate(row.endsAt);
  if(startsAt&&startsAt>now)return false;
  if(endsAt&&endsAt<now)return false;
  return true;
}

function rowState(row,moduleKey,now){
  return {
    moduleKey,
    active:isPaidModuleRowActive(row,now),
    monthlyPrice:Number(row?.monthlyPrice||0),
    startsAt:row?.startsAt||null,
    endsAt:row?.endsAt||null,
    notes:row?.notes||null,
    updatedAt:row?.updatedAt||null
  };
}

export function resolvePersonnelPackageStates(rows=[],now=new Date()){
  const byKey=new Map(rows.map(row=>[row.moduleKey,row]));
  const direct=Object.fromEntries(PERSONNEL_PACKAGE_KEYS.map(key=>[key,rowState(byKey.get(key),key,now)]));
  const legacy=rowState(byKey.get(AI_STAFF_SCHEDULER),AI_STAFF_SCHEDULER,now);
  const inheritance={
    [PERSONNEL_BASIC]:[PERSONNEL_BASIC,PERSONNEL_PRO,PERSONNEL_AI,AI_STAFF_SCHEDULER],
    [PERSONNEL_PRO]:[PERSONNEL_PRO,PERSONNEL_AI,AI_STAFF_SCHEDULER],
    [PERSONNEL_AI]:[PERSONNEL_AI,AI_STAFF_SCHEDULER],
    [PERSONNEL_PAYROLL]:[PERSONNEL_PAYROLL]
  };
  const activeByKey={...Object.fromEntries(PERSONNEL_PACKAGE_KEYS.map(key=>[key,direct[key].active])),[AI_STAFF_SCHEDULER]:legacy.active};
  const states={};
  for(const key of PERSONNEL_PACKAGE_KEYS){
    const inheritedFrom=inheritance[key].find(candidate=>candidate!==key&&activeByKey[candidate])||null;
    states[key]={
      ...direct[key],
      effectiveActive:direct[key].active||Boolean(inheritedFrom),
      inherited:Boolean(!direct[key].active&&inheritedFrom),
      inheritedFrom
    };
  }
  return {states,legacy};
}

export function personnelPackageDefinition(moduleKey){
  return PERSONNEL_PACKAGE_DEFINITIONS.find(item=>item.key===moduleKey)||null;
}
