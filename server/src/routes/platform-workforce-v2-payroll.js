import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {PERSONNEL_PAYROLL,requirePersonnelPackage} from "../store-paid-modules.js";
import {overlapDays,paymentBalance,payrollClosingSummary,payrollGross,payrollableAttendanceWhere,payrollWorkDate,reconcilePayrollDraft,shiftDurationMinutes} from "../workforce-v2-payroll.js";
import {audit,contextFor} from "./workforce-v2-access.js";

const router=Router({mergeParams:true});
const dateValue=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?null:date;};
router.use(async(req,res,next)=>{try{await requirePersonnelPackage(req,String(req.params.storeId||""),PERSONNEL_PAYROLL);next();}catch(error){next(error)}});

const payrollEmployees=(context,from,to,db=prisma)=>db.workforceEmployee.findMany({where:{companyId:context.company.id,active:true,OR:[{baseStoreId:context.store.id},{storeAccess:{some:{storeId:context.store.id,active:true}}}]},include:{hourlyRates:{where:{validFrom:{lte:to},OR:[{validTo:null},{validTo:{gt:from}}]},orderBy:{validFrom:"desc"},take:1}}});
const seedPayrollRows=employees=>new Map(employees.map(employee=>[employee.id,{employeeId:employee.id,employeeName:employee.fullName,paymentType:employee.paymentType,actualMinutes:0,overtimeMinutes:0,hourlyRate:employee.hourlyRates[0]?.hourlyRate==null?null:Number(employee.hourlyRates[0].hourlyRate),dailyRate:employee.paymentType==="DAILY"?Number(employee.dailyRate||0):null,fixedAmount:employee.paymentType==="FIXED_MONTHLY"?Number(employee.fixedMonthlyAmount||0):null,workDates:new Set()}]));

router.get("/open-cash-sessions",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const openSessions=await prisma.$queryRaw`SELECT "id","shiftLabel","terminalPos","openedAt" FROM "CashShiftSession" WHERE "companyId"=${context.company.id} AND "storeId"=${context.store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC`;
    res.json({openSessions});
  }catch(error){next(error)}
});

async function addPayrollEvidence(context,from,to,rows,db=prisma){
  const employeeIds=[...rows.keys()];
  if(!employeeIds.length)return;
  const [assignments,absences,leaves]=await Promise.all([
    db.workforceScheduleAssignment.findMany({where:{employeeId:{in:employeeIds},date:{gte:from,lt:to},schedule:{companyId:context.company.id,storeId:context.store.id,status:{in:["APPROVED","PUBLISHED","LOCKED"]}}},include:{shiftTemplate:true}}),
    db.workforceAbsence.findMany({where:{companyId:context.company.id,employeeId:{in:employeeIds},startsAt:{lt:to},OR:[{endsAt:null},{endsAt:{gte:from}}],AND:[{OR:[{storeId:null},{storeId:context.store.id}]},{approvedByUserId:{not:null}}]}}),
    db.workforceLeaveRequest.findMany({where:{companyId:context.company.id,employeeId:{in:employeeIds},status:"APPROVED",startDate:{lt:to},endDate:{gte:from},OR:[{storeId:null},{storeId:context.store.id}]}})
  ]);
  for(const row of rows.values()){row.plannedMinutes=0;row.absenceMinutes=0;row.approvedLeaveDays=0;row.approvedLeaveTypes=[]}
  for(const item of assignments){const row=rows.get(item.employeeId);if(row)row.plannedMinutes+=shiftDurationMinutes(item.shiftTemplate.startTime,item.shiftTemplate.endTime)}
  for(const item of absences){const row=rows.get(item.employeeId);if(!row)continue;const start=Math.max(new Date(item.startsAt).getTime(),from.getTime()),end=Math.min(new Date(item.endsAt||to).getTime(),to.getTime());row.absenceMinutes+=item.minutes??Math.max(0,Math.round((end-start)/60000))}
  for(const item of leaves){const row=rows.get(item.employeeId);if(!row)continue;row.approvedLeaveDays+=overlapDays(item.startDate,item.endDate,from,to);if(!row.approvedLeaveTypes.includes(item.leaveType))row.approvedLeaveTypes.push(item.leaveType)}
}

async function calculatedLines(context,from,to,db=prisma){
  const [sessions,employees]=await Promise.all([db.workforceAttendanceSession.findMany({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:from,lt:to},status:payrollableAttendanceWhere()},include:{employee:{include:{hourlyRates:{where:{validFrom:{lte:to},OR:[{validTo:null},{validTo:{gt:from}}]},orderBy:{validFrom:"desc"},take:1}}}}}),payrollEmployees(context,from,to,db)]);
  const rows=seedPayrollRows(employees);
  for(const session of sessions){const e=session.employee,rate=e.hourlyRates[0]?.hourlyRate??null,row=rows.get(e.id)||{employeeId:e.id,paymentType:e.paymentType,actualMinutes:0,overtimeMinutes:0,hourlyRate:rate==null?null:Number(rate),dailyRate:e.paymentType==="DAILY"?Number(e.dailyRate||0):null,fixedAmount:e.paymentType==="FIXED_MONTHLY"?Number(e.fixedMonthlyAmount||0):null,workDates:new Set()};row.actualMinutes+=session.workedMinutes;row.overtimeMinutes+=session.overtimeMinutes;row.workDates.add(payrollWorkDate(session.startedAt));rows.set(e.id,row)}
  await addPayrollEvidence(context,from,to,rows,db);
  return [...rows.values()].map(row=>{const workDays=row.workDates.size,grossAmount=Number(payrollGross({...row,workDays})||0);return {employeeId:row.employeeId,plannedMinutes:row.plannedMinutes,actualMinutes:row.actualMinutes,overtimeMinutes:row.overtimeMinutes,absenceMinutes:row.absenceMinutes,hourlyRate:row.hourlyRate,dailyRate:row.dailyRate,fixedAmount:row.fixedAmount,grossAmount,calculationJson:{source:"WORKFORCE_ATTENDANCE",paymentType:row.paymentType,workDays,approvedLeaveDays:row.approvedLeaveDays,approvedLeaveTypes:row.approvedLeaveTypes}}});
}

router.get("/preview",async(req,res,next)=>{
  try{
    const context=await contextFor(req),from=dateValue(req.query.from),to=dateValue(req.query.to);
    if(!from||!to||to<=from)return res.status(400).json({error:"Συμπλήρωσε έγκυρο διάστημα μισθοδοσίας."});
    const [sessions,employees]=await Promise.all([prisma.workforceAttendanceSession.findMany({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:from,lt:to},status:payrollableAttendanceWhere()},include:{employee:{include:{hourlyRates:{where:{validFrom:{lte:to},OR:[{validTo:null},{validTo:{gt:from}}]},orderBy:{validFrom:"desc"},take:1}}}},orderBy:{startedAt:"asc"}}),payrollEmployees(context,from,to)]);
    const rows=seedPayrollRows(employees);
    for(const session of sessions){const employee=session.employee,rate=employee.hourlyRates[0]?.hourlyRate??null,item=rows.get(employee.id)||{employeeId:employee.id,employeeName:employee.fullName,paymentType:employee.paymentType,actualMinutes:0,overtimeMinutes:0,hourlyRate:rate?Number(rate):null,dailyRate:employee.paymentType==="DAILY"?Number(employee.dailyRate||0):null,fixedAmount:employee.paymentType==="FIXED_MONTHLY"?Number(employee.fixedMonthlyAmount||0):null,workDates:new Set()};item.actualMinutes+=session.workedMinutes;item.overtimeMinutes+=session.overtimeMinutes;item.workDates.add(payrollWorkDate(session.startedAt));rows.set(employee.id,item);}
    await addPayrollEvidence(context,from,to,rows);
    const entries=[...rows.values()].map(({workDates,...item})=>({...item,workDays:workDates.size,grossAmount:payrollGross({...item,workDays:workDates.size})}));
    res.json({from,to,entries,totalAmount:Number(entries.reduce((sum,item)=>sum+(item.grossAmount||0),0).toFixed(2)),note:"Προεπισκόπηση από ολοκληρωμένες πραγματικές ώρες. Η τελική μισθοδοσία απαιτεί έλεγχο και κλείδωμα."});
  }catch(error){next(error)}
});

router.post("/periods",async(req,res,next)=>{
  try{
    const context=await contextFor(req),from=dateValue(req.body?.from),to=dateValue(req.body?.to),name=String(req.body?.name||"").trim();
    if(!from||!to||to<=from||!name)return res.status(400).json({error:"Συμπλήρωσε όνομα και έγκυρο διάστημα μισθοδοσίας."});
    const existing=await prisma.workforcePayrollPeriod.findFirst({where:{companyId:context.company.id,storeId:context.store.id,periodStart:from,periodEnd:to}});
    if(existing)return res.status(409).json({error:"Υπάρχει ήδη περίοδος για το ίδιο διάστημα."});
    const lines=await calculatedLines(context,from,to);
    const period=await prisma.workforcePayrollPeriod.create({data:{companyId:context.company.id,storeId:context.store.id,name,periodStart:from,periodEnd:to,createdByUserId:req.user?.id||null,lines:{create:lines.map(row=>({...row,balanceAmount:row.grossAmount}))}}});
    res.status(201).json({id:period.id,status:period.status,message:"Η περίοδος μισθοδοσίας δημιουργήθηκε ως προσχέδιο."});
  }catch(error){next(error)}
});

router.get("/periods",async(req,res,next)=>{try{const context=await contextFor(req);res.json(await prisma.workforcePayrollPeriod.findMany({where:{companyId:context.company.id,storeId:context.store.id},include:{_count:{select:{lines:true}}},orderBy:{periodStart:"desc"},take:100}));}catch(error){next(error)}});
router.get("/periods/:id",async(req,res,next)=>{try{const context=await contextFor(req),period=await prisma.workforcePayrollPeriod.findFirst({where:{id:req.params.id,companyId:context.company.id,storeId:context.store.id},include:{lines:{include:{employee:{select:{fullName:true}}}},payments:true,closing:true}});if(!period)return res.status(404).json({error:"Δεν βρέθηκε η περίοδος."});const paid=new Map();for(const p of period.payments)paid.set(p.employeeId,(paid.get(p.employeeId)||0)+Number(p.amount));res.json({...period,lines:period.lines.map(line=>({...line,employeeName:line.employee.fullName,paidAmount:Number(paid.get(line.employeeId)||0),balanceAmount:Number(line.grossAmount)-Number(paid.get(line.employeeId)||0)}))});}catch(error){next(error)}});
router.post("/periods/:id/recalculate",async(req,res,next)=>{try{
  const context=await contextFor(req),reason=String(req.body?.reason||"").trim();
  if(req.body?.confirmed!==true||reason.length<3)return res.status(400).json({error:"Ο επανυπολογισμός απαιτεί επιβεβαίωση και αιτιολογία."});
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "WorkforcePayrollPeriod" WHERE "id"=${req.params.id} AND "companyId"=${context.company.id} AND "storeId"=${context.store.id} FOR UPDATE`;
    const period=await tx.workforcePayrollPeriod.findFirst({where:{id:req.params.id,companyId:context.company.id,storeId:context.store.id},include:{lines:true,payments:true}});
    if(!period)throw Object.assign(new Error("Δεν βρέθηκε η περίοδος."),{status:404});
    if(period.status!=="DRAFT")throw Object.assign(new Error("Μόνο προσχέδιο μπορεί να επανυπολογιστεί."),{status:409});
    const unresolved=await tx.workforceAttendanceSession.count({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:period.periodStart,lt:period.periodEnd},status:{in:["OPEN","NEEDS_REVIEW","NEEDS_APPROVAL"]}}});
    if(unresolved)throw Object.assign(new Error(`Υπάρχουν ${unresolved} παρουσίες που χρειάζονται κλείσιμο ή έγκριση.`),{status:409});
    // Set the freshness watermark before reading attendance. Concurrent later edits must block close.
    const refreshed=await tx.workforcePayrollPeriod.update({where:{id:period.id},data:{updatedAt:new Date()}});
    const lines=await calculatedLines(context,period.periodStart,period.periodEnd,tx);
    const reconciliation=reconcilePayrollDraft(lines,period.lines,period.payments);
    if(!reconciliation.valid)throw Object.assign(new Error(reconciliation.reason==="OVERPAYMENT"?"Οι καταχωρισμένες πληρωμές υπερβαίνουν τη νέα μισθοδοσία. Χρειάζεται χειροκίνητη συμφωνία.":"Πληρωμένος εργαζόμενος δεν υπάρχει πλέον στον υπολογισμό. Χρειάζεται χειροκίνητη συμφωνία."),{status:409});
    for(const row of reconciliation.rows){const old=period.lines.find(line=>line.employeeId===row.employeeId);if(old)await tx.workforcePayrollLine.update({where:{id:old.id},data:row});else await tx.workforcePayrollLine.create({data:{...row,payrollPeriodId:period.id}})}
    for(const old of period.lines.filter(line=>!lines.some(row=>row.employeeId===line.employeeId)))await tx.workforcePayrollLine.delete({where:{id:old.id}});
    const totals=reconciliation.totals;
    await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_PAYROLL_PERIOD_RECALCULATED",entityType:"WORKFORCE_PAYROLL_PERIOD",entityId:period.id,before:{grossAmount:Number(period.lines.reduce((sum,line)=>sum+Number(line.grossAmount),0).toFixed(2)),paidAmount:totals.paidAmount},after:{...totals,freshnessAt:refreshed.updatedAt},reason});
    return totals;
  });
  res.json({...result,message:"Το προσχέδιο επανυπολογίστηκε. Οι ήδη καταχωρισμένες πληρωμές διατηρήθηκαν."});
}catch(error){next(error)}});
router.post("/periods/:id/payments",async(req,res,next)=>{try{
  const context=await contextFor(req),amount=Number(req.body?.amount),employeeId=String(req.body?.employeeId||""),paymentMethod=String(req.body?.paymentMethod||""),requestKey=String(req.body?.requestKey||"").trim();
  if(!(amount>0)||!employeeId)return res.status(400).json({error:"Συμπλήρωσε εργαζόμενο και έγκυρο ποσό."});
  if(requestKey.length<8||requestKey.length>160)return res.status(400).json({error:"Η πληρωμή χρειάζεται έγκυρο μοναδικό αναγνωριστικό υποβολής."});
  if(!["CASH_SHIFT","BANK_TRANSFER","CORPORATE_CARD"].includes(paymentMethod))return res.status(400).json({error:"Επίλεξε μετρητά από ενεργή βάρδια, τραπεζική μεταφορά ή εταιρική κάρτα."});
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "WorkforcePayrollPeriod" WHERE "id"=${req.params.id} AND "companyId"=${context.company.id} AND "storeId"=${context.store.id} FOR UPDATE`;
    const replay=await tx.workforceEmployeePayment.findUnique({where:{requestKey}});
    if(replay){if(replay.companyId!==context.company.id||replay.storeId!==context.store.id||replay.payrollPeriodId!==req.params.id)throw Object.assign(new Error("Το αναγνωριστικό υποβολής χρησιμοποιείται ήδη σε άλλη πληρωμή."),{status:409});const replayLine=await tx.workforcePayrollLine.findUnique({where:{payrollPeriodId_employeeId:{payrollPeriodId:req.params.id,employeeId:replay.employeeId}}});return {payment:replay,balanceAfter:Number(replayLine?.balanceAmount||0),duplicate:true}}
    const period=await tx.workforcePayrollPeriod.findFirst({where:{id:req.params.id,companyId:context.company.id,storeId:context.store.id}});
    if(!period||period.status!=="DRAFT")throw Object.assign(new Error("Η περίοδος δεν είναι ανοικτή για πληρωμή."),{status:409});
    const unresolvedAttendance=await tx.workforceAttendanceSession.count({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:period.periodStart,lt:period.periodEnd},status:{in:["OPEN","NEEDS_REVIEW","NEEDS_APPROVAL"]}}});
    if(unresolvedAttendance)throw Object.assign(new Error(`Υπάρχουν ${unresolvedAttendance} παρουσίες που χρειάζονται κλείσιμο ή έγκριση.`),{status:409});
    const changedAttendance=await tx.workforceAttendanceSession.count({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:period.periodStart,lt:period.periodEnd},updatedAt:{gt:period.updatedAt}}});
    if(changedAttendance)throw Object.assign(new Error("Οι παρουσίες άλλαξαν. Επανυπολόγισε την περίοδο πριν από νέα πληρωμή."),{status:409});
    const line=await tx.workforcePayrollLine.findUnique({where:{payrollPeriodId_employeeId:{payrollPeriodId:period.id,employeeId}}});
    if(!line)throw Object.assign(new Error("Ο εργαζόμενος δεν ανήκει σε αυτή την περίοδο μισθοδοσίας."),{status:404});
    const employee=await tx.workforceEmployee.findFirst({where:{id:employeeId,companyId:context.company.id},select:{fullName:true}});
    if(!employee)throw Object.assign(new Error("Δεν βρέθηκε ο εργαζόμενος."),{status:404});
    const totals=await tx.workforceEmployeePayment.aggregate({where:{payrollPeriodId:period.id,employeeId},_sum:{amount:true}});
    const check=paymentBalance({grossAmount:line.grossAmount,paidAmount:totals._sum.amount||0,newAmount:amount});
    if(!check.valid)throw Object.assign(new Error(check.reason==="OVERPAYMENT"?`Το ποσό υπερβαίνει το διαθέσιμο υπόλοιπο ${check.balance.toFixed(2)} €.`:"Μη έγκυρο ποσό πληρωμής."),{status:409});
    const actorId=req.user?.id||"SYSTEM",actorName=req.user?.fullName||"MyWorkStation",transactionId=crypto.randomUUID(),description=`Μισθοδοσία · ${employee.fullName} · ${period.name}`;
    let sessionId=null;
    if(paymentMethod==="CASH_SHIFT"){
      sessionId=String(req.body?.sessionId||"");
      if(!sessionId)throw Object.assign(new Error("Για πληρωμή με μετρητά επίλεξε την ενεργή βάρδια."),{status:400});
      const sessions=await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "id"=${sessionId} AND "companyId"=${context.company.id} AND "storeId"=${context.store.id} AND "status"='OPEN' FOR KEY SHARE`;
      if(!sessions[0])throw Object.assign(new Error("Η επιλεγμένη βάρδια δεν είναι ενεργή."),{status:409});
    }
    await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","paymentMethod","actorId","actorName","occurredAt") VALUES (${transactionId},${context.company.id},${context.store.id},${sessionId},'OTHER_EXPENSE',${amount},${description},${paymentMethod==="CASH_SHIFT"},${paymentMethod},${actorId},${actorName},NOW())`;
    if(paymentMethod!=="CASH_SHIFT"){
      let accounts=await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "companyId"=${context.company.id} AND "storeId"=${context.store.id} AND "name"='Ταμείο Τράπεζας' AND "active"=true LIMIT 1`;
      if(!accounts[0])accounts=await tx.$queryRaw`INSERT INTO "BankAccount" ("id","companyId","storeId","name","bankName","createdBy") VALUES (${crypto.randomUUID()},${context.company.id},${context.store.id},'Ταμείο Τράπεζας','Εικονικό',${actorId}) ON CONFLICT ("storeId","name") DO UPDATE SET "active"=true RETURNING "id"`;
      await tx.$executeRaw`INSERT INTO "BankLedgerEntry" ("id","companyId","storeId","bankAccountId","type","amount","status","sourceTransactionId","occurredAt","createdBy","createdByName") VALUES (${crypto.randomUUID()},${context.company.id},${context.store.id},${accounts[0].id},${paymentMethod},${-amount},'PENDING_PROOF',${transactionId},NOW(),${actorId},${actorName})`;
    }
    const payment=await tx.workforceEmployeePayment.create({data:{companyId:context.company.id,storeId:context.store.id,employeeId,payrollPeriodId:period.id,paymentDate:new Date(),paymentType:"PAYROLL",amount,paymentMethod,note:req.body?.note||null,sourceType:"STORE_TRANSACTION",sourceId:transactionId,requestKey,createdByUserId:req.user?.id||null}});
    await tx.workforcePayrollLine.update({where:{id:line.id},data:{paidAmount:check.paidAfter,balanceAmount:check.balanceAfter}});
    await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_PAYROLL_PAYMENT_CREATED",entityType:"WORKFORCE_EMPLOYEE_PAYMENT",entityId:payment.id,after:{payrollPeriodId:period.id,employeeId,amount,paymentMethod:payment.paymentMethod,sourceTransactionId:transactionId,sessionId,balanceAfter:check.balanceAfter}});
    return {payment,balanceAfter:check.balanceAfter,duplicate:false};
  });
  res.status(result.duplicate?200:201).json({id:result.payment.id,balanceAmount:result.balanceAfter,duplicate:result.duplicate,message:result.duplicate?"Η πληρωμή είχε ήδη καταχωριστεί. Δεν δημιουργήθηκε δεύτερη κίνηση.":"Η πληρωμή υπαλλήλου καταχωρίστηκε και αφαιρέθηκε από το υπόλοιπο."});
}catch(error){next(error)}});
router.post("/periods/:id/close",async(req,res,next)=>{try{
  const context=await contextFor(req),reason=String(req.body?.reason||"").trim();
  if(req.body?.confirmed!==true||reason.length<3)return res.status(400).json({error:"Η οριστικοποίηση απαιτεί επιβεβαίωση και αιτιολογία."});
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "WorkforcePayrollPeriod" WHERE "id"=${req.params.id} AND "companyId"=${context.company.id} AND "storeId"=${context.store.id} FOR UPDATE`;
    const period=await tx.workforcePayrollPeriod.findFirst({where:{id:req.params.id,companyId:context.company.id,storeId:context.store.id},include:{lines:true,payments:true,closing:true}});
    if(!period)throw Object.assign(new Error("Δεν βρέθηκε η περίοδος."),{status:404});
    if(period.status!=="DRAFT"||period.closing)throw Object.assign(new Error("Η περίοδος έχει ήδη οριστικοποιηθεί."),{status:409});
    const unresolvedAttendance=await tx.workforceAttendanceSession.count({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:period.periodStart,lt:period.periodEnd},status:{in:["OPEN","NEEDS_REVIEW","NEEDS_APPROVAL"]}}});
    if(unresolvedAttendance)throw Object.assign(new Error(`Υπάρχουν ${unresolvedAttendance} παρουσίες που χρειάζονται κλείσιμο ή έγκριση.`),{status:409});
    const changedAttendance=await tx.workforceAttendanceSession.count({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:period.periodStart,lt:period.periodEnd},updatedAt:{gt:period.updatedAt}}});
    if(changedAttendance)throw Object.assign(new Error("Οι παρουσίες άλλαξαν μετά τη δημιουργία της περιόδου. Απαιτείται επανυπολογισμός και συμφωνία πριν από το κλείδωμα."),{status:409});
    const totals=payrollClosingSummary(period.lines,period.payments);
    if(totals.openEmployeeCount)throw Object.assign(new Error(`Η περίοδος έχει υπόλοιπο ${totals.balanceAmount.toFixed(2)} € σε ${totals.openEmployeeCount} εργαζόμενους.`),{status:409});
    for(const row of totals.rows)await tx.workforcePayrollLine.update({where:{payrollPeriodId_employeeId:{payrollPeriodId:period.id,employeeId:row.employeeId}},data:{paidAmount:row.paidAmount,balanceAmount:row.balanceAmount}});
    const snapshot=JSON.parse(JSON.stringify({period:{id:period.id,name:period.name,periodStart:period.periodStart,periodEnd:period.periodEnd},lines:period.lines,payments:period.payments,totals:{...totals,rows:undefined}}));
    const closing=await tx.workforcePayrollClosing.create({data:{payrollPeriodId:period.id,previewJson:snapshot,totalsJson:{...totals,rows:undefined},reason,closedByUserId:req.user?.id||"SYSTEM"}});
    await tx.workforcePayrollPeriod.update({where:{id:period.id},data:{status:"CLOSED",closedByUserId:req.user?.id||null,closedAt:closing.closedAt}});
    await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_PAYROLL_PERIOD_CLOSED",entityType:"WORKFORCE_PAYROLL_PERIOD",entityId:period.id,before:{status:period.status},after:{status:"CLOSED",closingId:closing.id,totals:{...totals,rows:undefined}},reason});
    return {closingId:closing.id,closedAt:closing.closedAt,totals:{...totals,rows:undefined}};
  });
  res.json({...result,status:"CLOSED",message:"Η περίοδος μισθοδοσίας οριστικοποιήθηκε και κλειδώθηκε."});
}catch(error){next(error)}});
export default router;
