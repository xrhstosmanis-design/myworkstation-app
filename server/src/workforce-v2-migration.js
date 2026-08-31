import crypto from "crypto";

const GREEK_CODE_MAP={
  Α:"A",Β:"V",Γ:"G",Δ:"D",Ε:"E",Ζ:"Z",Η:"I",Θ:"TH",Ι:"I",Κ:"K",Λ:"L",Μ:"M",Ν:"N",Ξ:"X",Ο:"O",Π:"P",Ρ:"R",Σ:"S",Τ:"T",Υ:"Y",Φ:"F",Χ:"CH",Ψ:"PS",Ω:"O"
};

export function normalizeWorkforceText(value=""){
  return String(value||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/ς/g,"σ")
    .trim()
    .replace(/\s+/g," ")
    .toUpperCase();
}

export function workforceRoleCode(value=""){
  const normalized=normalizeWorkforceText(value);
  let transliterated="";
  for(const character of normalized){
    transliterated+=GREEK_CODE_MAP[character]??character;
  }
  const code=transliterated.replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40);
  return code||"ROLE_REVIEW";
}

function parseHour(value){
  const match=String(value||"").match(/^(\d{1,2}):/);
  return match?Number(match[1]):null;
}

function shiftBucket(shift){
  const text=normalizeWorkforceText(`${shift?.code||""} ${shift?.name||""}`);
  const hour=parseHour(shift?.startTime);
  if(/ΒΡΑΔ|ΝΥΧ|NIGHT/.test(text)||hour!==null&&(hour>=21||hour<5))return "NIGHT";
  if(/ΑΠΟΓ|ΜΕΣΗΜ|AFTERNOON|EVENING/.test(text)||hour!==null&&hour>=12)return "AFTERNOON";
  return "MORNING";
}

export function inferLegacyShiftAvailability(employee={}){
  const allowed=(employee.rules||[])
    .filter(rule=>rule?.allowed!==false&&rule?.shiftType)
    .map(rule=>rule.shiftType);
  if(!allowed.length){
    return {
      worksMorning:true,
      worksAfternoon:true,
      worksNight:false,
      source:"DEFAULT_REVIEW_REQUIRED",
      warnings:["Δεν υπάρχουν παλιοί κανόνες βαρδιών· χρησιμοποιούνται ασφαλείς προεπιλογές."]
    };
  }
  const buckets=new Set(allowed.map(shiftBucket));
  return {
    worksMorning:buckets.has("MORNING"),
    worksAfternoon:buckets.has("AFTERNOON"),
    worksNight:buckets.has("NIGHT"),
    source:"LEGACY_ALLOWED_SHIFTS",
    warnings:[]
  };
}

function uniqueById(rows=[]){
  return [...new Map(rows.filter(Boolean).map(row=>[row.id,row])).values()];
}

function decimalNumber(value,fallback=null){
  if(value===null||value===undefined||value==="")return fallback;
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}

function roleMatchFor(position,roles){
  const normalized=normalizeWorkforceText(position);
  if(!normalized)return {status:"MISSING",role:null,proposedName:null,proposedCode:null};
  const code=workforceRoleCode(position);
  const role=roles.find(item=>normalizeWorkforceText(item.name)===normalized||normalizeWorkforceText(item.code)===normalizeWorkforceText(code))||null;
  return {status:role?"MATCHED":"MISSING",role,proposedName:String(position).trim(),proposedCode:code};
}

function duplicateCandidates(legacy,existing){
  const email=normalizeWorkforceText(legacy.email);
  const name=normalizeWorkforceText(legacy.fullName);
  return uniqueById(existing.filter(candidate=>{
    if(candidate.legacyEmployeeId&&candidate.legacyEmployeeId===legacy.id)return true;
    if(email&&normalizeWorkforceText(candidate.email)===email)return true;
    return name&&normalizeWorkforceText(candidate.fullName)===name;
  }));
}

function previewFingerprint(rows){
  const compact=rows.map(row=>({
    legacyEmployeeId:row.legacy.id,
    legacyUpdatedAt:row.legacy.updatedAt||null,
    status:row.status,
    proposed:row.proposed,
    roleId:row.roleMapping.role?.id||null,
    duplicateIds:row.duplicateCandidates.map(candidate=>candidate.id)
  }));
  return crypto.createHash("sha256").update(JSON.stringify(compact)).digest("hex");
}

export function buildWorkforceMigrationPreview({legacyEmployees=[],workforceEmployees=[],roles=[],stores=[]}={}){
  const storeMap=new Map(stores.map(store=>[store.id,store]));
  const rows=legacyEmployees.map(legacy=>{
    const blockers=[];
    const warnings=[];
    const store=storeMap.get(legacy.storeId)||legacy.store||null;
    if(!String(legacy.fullName||"").trim())blockers.push("Λείπει ονοματεπώνυμο.");
    if(!store)blockers.push("Το παλιό κατάστημα δεν ανήκει στο επιλεγμένο scope.");

    const availability=inferLegacyShiftAvailability(legacy);
    warnings.push(...availability.warnings);
    const roleMapping=roleMatchFor(legacy.position,roles);
    if(roleMapping.status!=="MATCHED")warnings.push(legacy.position?`Δεν υπάρχει έτοιμος ρόλος για τη θέση «${legacy.position}».`:"Δεν υπάρχει θέση/ρόλος στο παλιό αρχείο.");

    const duplicates=duplicateCandidates(legacy,workforceEmployees);
    const exact=duplicates.find(candidate=>candidate.legacyEmployeeId===legacy.id)||null;
    if(!exact&&duplicates.length)warnings.push("Βρέθηκε πιθανός διπλότυπος εργαζόμενος και απαιτείται χειροκίνητος έλεγχος.");

    const maxDays=Math.max(1,Math.min(7,Number(legacy.maxDaysPerWeek||5)));
    const maxHours=Math.max(1,Math.min(168,decimalNumber(legacy.maxHoursPerWeek,maxDays*8)));
    const proposed={
      legacyEmployeeId:legacy.id,
      fullName:String(legacy.fullName||"").trim(),
      phone:legacy.phone||null,
      email:legacy.email||null,
      baseStoreId:legacy.storeId||null,
      paymentType:"HOURLY",
      fixedMonthlyAmount:null,
      maxDaysPerWeek:maxDays,
      maxHoursPerWeek:maxHours,
      minimumDaysOff:Math.max(0,7-maxDays),
      canChangeStore:false,
      worksMorning:availability.worksMorning,
      worksAfternoon:availability.worksAfternoon,
      worksNight:availability.worksNight,
      worksWeekend:true,
      notes:legacy.position?`Μεταφορά από παλιό module · Θέση: ${legacy.position}`:"Μεταφορά από παλιό module",
      active:legacy.active!==false,
      roleIds:roleMapping.role?[roleMapping.role.id]:[],
      primaryRoleId:roleMapping.role?.id||null,
      storeAccess:legacy.storeId?[{storeId:legacy.storeId,isBaseStore:true,canSchedule:true}]:[]
    };

    let status="READY";
    if(blockers.length)status="BLOCKED";
    else if(exact)status="ALREADY_LINKED";
    else if(duplicates.length||roleMapping.status!=="MATCHED")status="NEEDS_REVIEW";

    return {
      status,
      legacy:{
        id:legacy.id,
        fullName:legacy.fullName,
        phone:legacy.phone||null,
        email:legacy.email||null,
        position:legacy.position||null,
        type:legacy.type||null,
        active:legacy.active!==false,
        storeId:legacy.storeId,
        storeName:store?.name||legacy.store?.name||null,
        updatedAt:legacy.updatedAt||null
      },
      proposed,
      availabilitySource:availability.source,
      roleMapping,
      duplicateCandidates:duplicates.map(candidate=>({
        id:candidate.id,
        fullName:candidate.fullName,
        email:candidate.email||null,
        baseStoreId:candidate.baseStoreId||null,
        legacyEmployeeId:candidate.legacyEmployeeId||null
      })),
      blockers,
      warnings
    };
  });

  const summary={
    total:rows.length,
    ready:rows.filter(row=>row.status==="READY").length,
    needsReview:rows.filter(row=>row.status==="NEEDS_REVIEW").length,
    alreadyLinked:rows.filter(row=>row.status==="ALREADY_LINKED").length,
    blocked:rows.filter(row=>row.status==="BLOCKED").length,
    missingRole:rows.filter(row=>row.roleMapping.status!=="MATCHED").length,
    possibleDuplicates:rows.filter(row=>row.status!=="ALREADY_LINKED"&&row.duplicateCandidates.length>0).length
  };

  return {summary,rows,previewHash:previewFingerprint(rows)};
}
