import {salesReportCalendar} from "./sales-report-calendar.js";
import {PERSONNEL_BASIC,PERSONNEL_PAYROLL,resolvePersonnelPackageStates} from "../personnel-packages.js";

const LIMIT=10000;
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
const reasons=new Set(["NO_WORKFORCE_LINK","MULTIPLE_WORKFORCE_LINKS","LINK_SCOPE_MISMATCH","LINK_NOT_APPROVED","NON_POSITIVE_PAYROLL_AMOUNT","LINK_AMOUNT_MISMATCH","LINK_METHOD_MISMATCH","EMPLOYEE_SCOPE_MISMATCH"]);
const failure=(status,code,message)=>Object.assign(new Error(message),{status,code});
const invalid=()=>failure(502,"RECORDED_EXPENSE_SOURCE_INVALID","Δεν επιβεβαιώθηκε η ακεραιότητα της πηγής καταγεγραμμένων εξόδων.");
const unavailable=()=>failure(503,"RECORDED_EXPENSE_SOURCE_UNAVAILABLE","Η πηγή καταγεγραμμένων εξόδων δεν είναι διαθέσιμη. Δεν έγινε δημιουργία πινάκων.");
const text=value=>typeof value==="string"&&value.trim()===value&&value.length>0&&value.length<=180&&!/[\u0000-\u001f\u007f]/.test(value);

function safeInteger(value){
  if(typeof value!=="bigint"||value>MAX_SAFE||value< -MAX_SAFE)throw invalid();
  return Number(value);
}
function count(value){
  if(typeof value!=="string"||! /^(0|[1-9]\d*)$/.test(value)||value.length>16)throw invalid();
  return safeInteger(BigInt(value));
}
function cents(value){
  // PostgreSQL NUMERIC is selected as text, never rounded through a float.
  if(typeof value!=="string"||value.length>24||! /^-?(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))throw invalid();
  const negative=value.startsWith("-"),[whole,fraction=""]=value.replace(/^-/ ,"").split(".");
  const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0"));
  return safeInteger(negative?-result:result);
}
function isoDate(value){
  if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw invalid();
  return value.toISOString();
}
function scopeInput({user,storeId,from,to,timeZone},now){
  if(!user||user.tokenType==="STORE_OPERATOR"||!["OWNER","SUPER_ADMIN"].includes(user.role))throw failure(403,"RECORDED_EXPENSE_ROLE_DENIED","Η αναφορά απαιτεί Ιδιοκτήτη ή Super Admin.");
  if(!text(user.companyId))throw failure(400,"RECORDED_EXPENSE_SCOPE_REQUIRED","Επίλεξε εταιρεία για την αναφορά.");
  if(!text(storeId))throw failure(400,"RECORDED_EXPENSE_SCOPE_REQUIRED","Επίλεξε συγκεκριμένο κατάστημα για την αναφορά.");
  if(timeZone!=="Europe/Athens"||typeof from!=="string"||typeof to!=="string"||! /^\d{4}-\d{2}-\d{2}$/.test(from)||! /^\d{4}-\d{2}-\d{2}$/.test(to))throw failure(400,"RECORDED_EXPENSE_PERIOD_INVALID","Επίλεξε έγκυρες ημερομηνίες και ώρα Ελλάδας.");
  const calendar=salesReportCalendar(from,to);
  if(calendar.to.getTime()>now.getTime())throw failure(400,"RECORDED_EXPENSE_PERIOD_NOT_ENDED","Η αναφορά απαιτεί ολοκληρωμένες ημέρες στην ώρα Ελλάδας.");
  return {companyId:user.companyId,storeId,calendar,superAdmin:user.role==="SUPER_ADMIN"};
}
function validModuleDate(value){return value===null||value instanceof Date&&Number.isFinite(value.getTime());}
async function scopeAndPackages(tx,{companyId,storeId,superAdmin},now){
  const owned=await tx.$queryRaw`SELECT c."id" AS "companyId",c."active" AS "companyActive",s."id" AS "storeId",s."active" AS "storeActive"
    FROM "Company" c JOIN "Store" s ON s."companyId"=c."id"
    WHERE c."id"=${companyId} AND s."id"=${storeId}`;
  if(!Array.isArray(owned)||owned.length!==1||owned[0].companyId!==companyId||owned[0].storeId!==storeId||owned[0].companyActive!==true||owned[0].storeActive!==true)throw failure(404,"RECORDED_EXPENSE_STORE_UNAVAILABLE","Δεν βρέθηκε ενεργό κατάστημα στην επιλεγμένη εταιρεία.");
  if(superAdmin)return;
  const rows=await tx.$queryRaw`SELECT "companyId","storeId","moduleKey","active","startsAt","endsAt"
    FROM "StorePaidModule" WHERE "storeId"=${storeId}`;
  if(!Array.isArray(rows)||rows.length>256)throw invalid();
  const keys=new Set();
  for(const row of rows){
    if(!row||row.companyId!==companyId||row.storeId!==storeId||!text(row.moduleKey)||keys.has(row.moduleKey)||typeof row.active!=="boolean"||!validModuleDate(row.startsAt)||!validModuleDate(row.endsAt)||row.startsAt&&row.endsAt&&row.startsAt>row.endsAt)throw invalid();
    keys.add(row.moduleKey);
  }
  const resolved=resolvePersonnelPackageStates(rows,now);
  if(!resolved.states[PERSONNEL_BASIC]?.effectiveActive||!resolved.states[PERSONNEL_PAYROLL]?.effectiveActive)throw failure(403,"STORE_MODULE_DISABLED","Απαιτούνται ενεργά πακέτα BASIC Προσωπικό και Payroll για το κατάστημα.");
}

async function sourceRows(tx,{companyId,storeId,calendar}){
  return tx.$queryRaw`
    WITH ledger AS MATERIALIZED (
      SELECT t."id",t."occurredAt",t."amount",t."paymentMethod"
      FROM "StoreTransaction" t
      WHERE t."companyId"=${companyId} AND t."storeId"=${storeId} AND t."type"='OTHER_EXPENSE'
        AND t."reversedAt" IS NULL AND t."occurredAt">=${calendar.from} AND t."occurredAt"<${calendar.to}
    ), limited AS MATERIALIZED (
      SELECT * FROM ledger ORDER BY "occurredAt","id" LIMIT 10000
    ), links AS (
      SELECT p."sourceId",COUNT(*)::text AS "linkCount",MAX(p."id") AS "paymentId",MAX(p."companyId") AS "companyId",
        MAX(p."storeId") AS "storeId",MAX(p."employeeId") AS "employeeId",MAX(p."approvalStatus") AS "approvalStatus",
        MAX(p."amount") AS "amount",MAX(p."paymentMethod") AS "paymentMethod"
      FROM "WorkforceEmployeePayment" p JOIN limited l ON l."id"=p."sourceId"
      WHERE p."sourceType"='STORE_TRANSACTION' GROUP BY p."sourceId"
    ), classified AS (
      SELECT l.*,p."paymentId",e."id" AS "employeeId",e."fullName" AS "employeeName",
        CASE WHEN p."linkCount" IS NULL THEN 'NO_WORKFORCE_LINK'
          WHEN p."linkCount"<>'1' THEN 'MULTIPLE_WORKFORCE_LINKS'
          WHEN p."companyId" IS DISTINCT FROM ${companyId} OR p."storeId" IS DISTINCT FROM ${storeId} THEN 'LINK_SCOPE_MISMATCH'
          WHEN p."approvalStatus" IS DISTINCT FROM 'APPROVED' THEN 'LINK_NOT_APPROVED'
          WHEN l."amount"<=0 OR p."amount"<=0 THEN 'NON_POSITIVE_PAYROLL_AMOUNT'
          WHEN p."amount" IS DISTINCT FROM l."amount" THEN 'LINK_AMOUNT_MISMATCH'
          WHEN l."paymentMethod" IS NULL OR p."paymentMethod" IS DISTINCT FROM l."paymentMethod" THEN 'LINK_METHOD_MISMATCH'
          WHEN e."id" IS NULL THEN 'EMPLOYEE_SCOPE_MISMATCH'
          ELSE NULL END AS "reviewReason"
      FROM limited l LEFT JOIN links p ON p."sourceId"=l."id"
      LEFT JOIN "WorkforceEmployee" e ON e."id"=p."employeeId" AND e."companyId"=${companyId}
    )
    SELECT c."id" AS "transactionId",c."occurredAt",c."amount"::text AS "amount",c."paymentMethod",c."reviewReason",
      CASE WHEN c."reviewReason" IS NULL THEN c."paymentId" END AS "paymentId",
      CASE WHEN c."reviewReason" IS NULL THEN c."employeeId" END AS "employeeId",
      CASE WHEN c."reviewReason" IS NULL THEN c."employeeName" END AS "employeeName",totals."totalRowCount"
    FROM (SELECT COUNT(*)::text AS "totalRowCount" FROM ledger) totals
    LEFT JOIN classified c ON TRUE ORDER BY c."occurredAt",c."id"`;
}

function report(rows,scope,now){
  if(!Array.isArray(rows)||!rows.length)throw invalid();
  const total=count(rows[0]?.totalRowCount),returned=Math.min(total,LIMIT);
  if(rows.length!==(returned||1)||rows.some(row=>row.totalRowCount!==rows[0].totalRowCount))throw invalid();
  if(!returned&&["transactionId","occurredAt","amount","paymentMethod","reviewReason","paymentId","employeeId","employeeName"].some(key=>rows[0][key]!==null))throw invalid();
  const items=[],seen=new Set(),employees=new Map();
  let totalCents=0n,payrollCents=0n,unattributedCents=0n,attributedCount=0,unattributedCount=0,previous=null;
  for(const row of returned?rows:[]){
    if(!text(row.transactionId)||seen.has(row.transactionId))throw invalid();
    seen.add(row.transactionId);
    const occurredAt=isoDate(row.occurredAt),at=row.occurredAt.getTime();
    if(at<scope.calendar.from.getTime()||at>=scope.calendar.to.getTime()||previous&&at<previous.at)throw invalid();
    previous={at,id:row.transactionId};
    if(!(row.paymentMethod===null||typeof row.paymentMethod==="string"&&row.paymentMethod.length<=128&&!/[\u0000-\u001f\u007f]/.test(row.paymentMethod)))throw invalid();
    const amountCents=cents(row.amount),attributed=row.reviewReason===null;
    if(!attributed&&!reasons.has(row.reviewReason))throw invalid();
    if(attributed){
      if(amountCents<=0||!text(row.paymentId)||!text(row.employeeId)||typeof row.employeeName!=="string"||row.employeeName.length>1000||!row.employeeName.trim()||row.paymentMethod===null)throw invalid();
    }else if(row.paymentId!==null||row.employeeId!==null||row.employeeName!==null)throw invalid();
    const payrollAttribution={status:attributed?"ATTRIBUTED":"UNATTRIBUTED",reason:row.reviewReason,employeeId:row.employeeId,employeeName:row.employeeName,paymentId:row.paymentId};
    items.push({transactionId:row.transactionId,occurredAt,paymentMethod:row.paymentMethod,amountCents,payrollAttribution});
    totalCents+=BigInt(amountCents);
    if(attributed){
      payrollCents+=BigInt(amountCents);attributedCount++;
      const employee=employees.get(row.employeeId)||{employeeId:row.employeeId,employeeName:row.employeeName,amount:0n,transactionCount:0};
      if(employee.employeeName!==row.employeeName)throw invalid();
      employee.amount+=BigInt(amountCents);employee.transactionCount++;employees.set(row.employeeId,employee);
    }else{unattributedCents+=BigInt(amountCents);unattributedCount++;}
  }
  const complete=total===returned;
  const totals=complete?{
    recordedExpenseCents:safeInteger(totalCents),linkedPayrollCents:safeInteger(payrollCents),unattributedExpenseCents:safeInteger(unattributedCents),
    attributedTransactionCount:attributedCount,unattributedTransactionCount:unattributedCount,
    byEmployee:[...employees.values()].sort((a,b)=>a.employeeId.localeCompare(b.employeeId)).map(({amount,...employee})=>({...employee,amountCents:safeInteger(amount)}))
  }:null;
  return {
    companyId:scope.companyId,storeId:scope.storeId,asOf:now.toISOString(),
    period:{calendarFrom:scope.calendar.calendarFrom,calendarTo:scope.calendar.calendarTo,timeZone:"Europe/Athens",from:scope.calendar.from.toISOString(),toExclusive:scope.calendar.to.toISOString()},
    basis:"NONREVERSED_RECORDED_OTHER_EXPENSE_LEDGER",settlementVerified:false,accrualIncluded:false,standaloneWorkforcePaymentsIncluded:false,
    sourceCoverage:{complete,totalRowCount:total,returnedRowCount:returned,limit:LIMIT,totalsScope:complete?"COMPLETE_LEDGER":"RETURNED_ROWS",payrollAttribution:"LINKED_ONLY"},
    items,totals,limitations:["RECORDED_LEDGER_NOT_SETTLEMENT_PROOF","LINKED_PAYROLL_ONLY","STANDALONE_WORKFORCE_PAYMENTS_EXCLUDED","ACCRUAL_EXCLUDED","UNLINKED_EXPENSES_MAY_INCLUDE_PAYROLL","NOT_SERIALIZABLE_AUTHORIZATION_REVOCATION"]
  };
}

export async function readRecordedPayrollExpenseReport(input,{db,now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw failure(500,"RECORDED_EXPENSE_CLOCK_INVALID","Δεν επιβεβαιώθηκε ο χρόνος αναφοράς.");
  const asOf=new Date(now.getTime()),scope=scopeInput(input||{},asOf);
  if(!db||typeof db.$transaction!=="function")throw unavailable();
  try{
    return await db.$transaction(async tx=>{
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
      await scopeAndPackages(tx,scope,asOf);
      return report(await sourceRows(tx,scope),scope,asOf);
    },{isolationLevel:"RepeatableRead",maxWait:2000,timeout:10000});
  }catch(error){
    const sqlCode=error?.meta?.code||error?.code;
    if(["42P01","42703","57014","P2024","P2028"].includes(sqlCode))throw unavailable();
    throw error;
  }
}
