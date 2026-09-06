import {z} from "zod";
import {prisma} from "../prisma.js";
import {PERSONNEL_BASIC,isSuperAdmin,requirePersonnelPackage} from "../store-paid-modules.js";
import {
  WORKFORCE_RULE_SEVERITIES,
  WORKFORCE_RULE_TYPES,
  WORKFORCE_SHIFT_CATEGORY_CODES,
  workforceRuleDefinition
} from "../workforce-v2-rules.js";

export const confirmed=z.literal(true);
export const roleSchema=z.object({
  name:z.string().trim().min(2).max(120),code:z.string().trim().min(2).max(40).optional(),
  description:z.string().trim().max(500).optional().nullable(),confirmed,reason:z.string().trim().min(3).max(500)
});

const storeAccessSchema=z.object({storeId:z.string().min(1),canSchedule:z.boolean().default(true)});
export const employeeSchema=z.object({
  fullName:z.string().trim().min(2).max(160),phone:z.string().trim().max(50).optional().nullable(),
  email:z.union([z.string().trim().email(),z.literal(""),z.null()]).optional(),baseStoreId:z.string().min(1),
  pin:z.union([z.string().regex(/^\d{4,8}$/,"Ο PIN πρέπει να έχει 4 έως 8 ψηφία."),z.literal(""),z.null()]).optional(),
  paymentType:z.enum(["HOURLY","FIXED_MONTHLY"]),hourlyRate:z.coerce.number().positive().max(10000).optional().nullable(),
  fixedMonthlyAmount:z.coerce.number().positive().max(10000000).optional().nullable(),effectiveFrom:z.coerce.date(),
  maxDaysPerWeek:z.coerce.number().int().min(1).max(7),maxHoursPerWeek:z.coerce.number().min(1).max(168),
  minimumDaysOff:z.coerce.number().int().min(0).max(6),canChangeStore:z.boolean(),worksMorning:z.boolean(),
  worksAfternoon:z.boolean(),worksNight:z.boolean(),worksWeekend:z.boolean(),notes:z.string().trim().max(2000).optional().nullable(),
  roleIds:z.array(z.string().min(1)).min(1).max(20),primaryRoleId:z.string().min(1),
  storeAccess:z.array(storeAccessSchema).min(1).max(100),confirmed,reason:z.string().trim().min(3).max(500)
}).superRefine((value,ctx)=>{
  if(value.paymentType==="HOURLY"&&!(Number(value.hourlyRate)>0))ctx.addIssue({code:z.ZodIssueCode.custom,path:["hourlyRate"],message:"Απαιτείται ωρομίσθιο."});
  if(value.paymentType==="FIXED_MONTHLY"&&!(Number(value.fixedMonthlyAmount)>0))ctx.addIssue({code:z.ZodIssueCode.custom,path:["fixedMonthlyAmount"],message:"Απαιτείται σταθερό μηνιαίο ποσό."});
  if(!value.roleIds.includes(value.primaryRoleId))ctx.addIssue({code:z.ZodIssueCode.custom,path:["primaryRoleId"],message:"Ο κύριος ρόλος πρέπει να περιλαμβάνεται στους επιλεγμένους ρόλους."});
});

const optionalDate=z.union([z.null(),z.coerce.date()]).optional();
export const workforceRuleSchema=z.object({
  employeeId:z.string().min(1),ruleType:z.enum(WORKFORCE_RULE_TYPES),severity:z.enum(WORKFORCE_RULE_SEVERITIES),
  relatedEmployeeId:z.union([z.string().min(1),z.null()]).optional(),value:z.unknown().optional().nullable(),
  note:z.string().trim().max(1000).optional().nullable(),validFrom:optionalDate,validTo:optionalDate,
  confirmed,reason:z.string().trim().min(3).max(500)
}).superRefine((value,ctx)=>{
  const definition=workforceRuleDefinition(value.ruleType);
  if(definition?.valueKind==="RELATED_EMPLOYEE"&&!value.relatedEmployeeId){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["relatedEmployeeId"],message:"Επίλεξε τον εργαζόμενο που δεν πρέπει να βρίσκεται στην ίδια βάρδια."});
  }
  if(definition?.valueKind!=="RELATED_EMPLOYEE"&&value.relatedEmployeeId){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["relatedEmployeeId"],message:"Ο συγκεκριμένος κανόνας δεν δέχεται δεύτερο εργαζόμενο."});
  }
  if(definition?.valueKind==="NUMBER_DAYS_OFF"){
    const days=Number(value.value?.days);
    if(!Number.isInteger(days)||days<1||days>6)ctx.addIssue({code:z.ZodIssueCode.custom,path:["value","days"],message:"Τα ελάχιστα ρεπό πρέπει να είναι από 1 έως 6."});
  }
  if(definition?.valueKind==="NUMBER_HOURS"){
    const hours=Number(value.value?.hours);
    if(!Number.isFinite(hours)||hours<1||hours>168)ctx.addIssue({code:z.ZodIssueCode.custom,path:["value","hours"],message:"Οι μέγιστες ώρες πρέπει να είναι από 1 έως 168."});
  }
  if(value.validFrom&&value.validTo&&value.validTo<value.validFrom){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["validTo"],message:"Η ημερομηνία λήξης δεν μπορεί να είναι πριν από την ημερομηνία έναρξης."});
  }
});

const timeText=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,"Η ώρα πρέπει να είναι στη μορφή ΩΩ:ΛΛ.");
export const workforceShiftTemplateSchema=z.object({
  name:z.string().trim().min(2).max(120),code:z.string().trim().min(2).max(40).optional(),
  category:z.enum(WORKFORCE_SHIFT_CATEGORY_CODES),startTime:timeText,endTime:timeText,
  minimumPeople:z.coerce.number().int().min(1).max(100),maximumPeople:z.union([z.null(),z.coerce.number().int().min(1).max(100)]).optional(),
  requiredRoleId:z.union([z.string().min(1),z.null()]).optional(),requiresSupervisor:z.boolean(),changeAllowed:z.boolean(),
  confirmed,reason:z.string().trim().min(3).max(500)
}).superRefine((value,ctx)=>{
  if(value.maximumPeople!==null&&value.maximumPeople!==undefined&&value.maximumPeople<value.minimumPeople){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["maximumPeople"],message:"Τα μέγιστα άτομα δεν μπορεί να είναι λιγότερα από τα ελάχιστα."});
  }
});

export async function validateEmployeeReferences(req,context,body){
  const storeIds=[...new Set([body.baseStoreId,...body.storeAccess.map(row=>row.storeId)])];
  const roleIds=[...new Set(body.roleIds)];
  if(!storeIds.includes(body.baseStoreId))throw Object.assign(new Error("Το κατάστημα βάσης πρέπει να περιλαμβάνεται στην πρόσβαση εργαζομένου."),{status:400});
  if(!body.canChangeStore&&storeIds.length>1)throw Object.assign(new Error("Για πρόσβαση σε πολλά καταστήματα πρέπει να ενεργοποιηθεί η αλλαγή καταστήματος."),{status:400});
  const [stores,roles]=await Promise.all([
    prisma.store.findMany({where:{id:{in:storeIds},companyId:context.company.id,active:true},select:{id:true,name:true}}),
    prisma.workforceRole.findMany({where:{id:{in:roleIds},companyId:context.company.id,active:true},select:{id:true,name:true,code:true}})
  ]);
  if(stores.length!==storeIds.length)throw Object.assign(new Error("Ένα ή περισσότερα καταστήματα δεν ανήκουν στον ιδιοκτήτη ή είναι ανενεργά."),{status:400});
  if(roles.length!==roleIds.length)throw Object.assign(new Error("Ένας ή περισσότεροι ρόλοι δεν είναι έγκυροι ή είναι ανενεργοί."),{status:400});
  if(!isSuperAdmin(req.user))await Promise.all(storeIds.map(storeId=>requirePersonnelPackage(req,storeId,PERSONNEL_BASIC)));
  const accessByStore=new Map(body.storeAccess.map(row=>[row.storeId,row]));
  if(!accessByStore.has(body.baseStoreId))accessByStore.set(body.baseStoreId,{storeId:body.baseStoreId,canSchedule:true});
  return {stores,roles,storeAccess:[...accessByStore.values()]};
}

export async function ensureEmployeeNameAvailable(companyId,baseStoreId,fullName,excludeId=null){
  const duplicate=await prisma.workforceEmployee.findFirst({
    where:{companyId,baseStoreId,fullName:{equals:fullName,mode:"insensitive"},...(excludeId?{NOT:{id:excludeId}}:{})},
    select:{id:true,fullName:true}
  });
  if(duplicate)throw Object.assign(new Error("Υπάρχει ήδη εργαζόμενος Workforce v2 με το ίδιο όνομα στο κατάστημα βάσης."),{status:409,code:"WORKFORCE_EMPLOYEE_DUPLICATE"});
}
