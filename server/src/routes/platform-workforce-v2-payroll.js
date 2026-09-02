import {Router} from "express";
import {prisma} from "../prisma.js";
import {contextFor} from "./workforce-v2-access.js";

const router=Router({mergeParams:true});
const dateValue=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?null:date;};

router.get("/preview",async(req,res,next)=>{
  try{
    const context=await contextFor(req),from=dateValue(req.query.from),to=dateValue(req.query.to);
    if(!from||!to||to<=from)return res.status(400).json({error:"Συμπλήρωσε έγκυρο διάστημα μισθοδοσίας."});
    const sessions=await prisma.workforceAttendanceSession.findMany({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:from,lt:to},status:"COMPLETED"},include:{employee:{include:{hourlyRates:{where:{validFrom:{lte:to},OR:[{validTo:null},{validTo:{gt:from}}]},orderBy:{validFrom:"desc"},take:1}}}},orderBy:{startedAt:"asc"}});
    const rows=new Map();
    for(const session of sessions){const employee=session.employee,rate=employee.hourlyRates[0]?.hourlyRate??null,item=rows.get(employee.id)||{employeeId:employee.id,employeeName:employee.fullName,paymentType:employee.paymentType,actualMinutes:0,overtimeMinutes:0,hourlyRate:rate?Number(rate):null,fixedAmount:employee.paymentType==="FIXED_MONTHLY"?Number(employee.fixedMonthlyAmount||0):null};item.actualMinutes+=session.workedMinutes;item.overtimeMinutes+=session.overtimeMinutes;rows.set(employee.id,item);}
    const entries=[...rows.values()].map(item=>({...item,grossAmount:item.paymentType==="HOURLY"&&item.hourlyRate!==null?Number((item.actualMinutes/60*item.hourlyRate).toFixed(2)):item.fixedAmount}));
    res.json({from,to,entries,totalAmount:Number(entries.reduce((sum,item)=>sum+(item.grossAmount||0),0).toFixed(2)),note:"Προεπισκόπηση από ολοκληρωμένες πραγματικές ώρες. Η τελική μισθοδοσία απαιτεί έλεγχο και κλείδωμα."});
  }catch(error){next(error)}
});

router.post("/periods",async(req,res,next)=>{
  try{
    const context=await contextFor(req),from=dateValue(req.body?.from),to=dateValue(req.body?.to),name=String(req.body?.name||"").trim();
    if(!from||!to||to<=from||!name)return res.status(400).json({error:"Συμπλήρωσε όνομα και έγκυρο διάστημα μισθοδοσίας."});
    const existing=await prisma.workforcePayrollPeriod.findFirst({where:{companyId:context.company.id,storeId:context.store.id,periodStart:from,periodEnd:to}});
    if(existing)return res.status(409).json({error:"Υπάρχει ήδη περίοδος για το ίδιο διάστημα."});
    const sessions=await prisma.workforceAttendanceSession.findMany({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:from,lt:to},status:"COMPLETED"},include:{employee:{include:{hourlyRates:{where:{validFrom:{lte:to},OR:[{validTo:null},{validTo:{gt:from}}]},orderBy:{validFrom:"desc"},take:1}}}}});
    const grouped=new Map(); for(const s of sessions){const e=s.employee,r=e.hourlyRates[0]?.hourlyRate??null,row=grouped.get(e.id)||{employeeId:e.id,actualMinutes:0,overtimeMinutes:0,hourlyRate:r,fixedAmount:e.paymentType==="FIXED_MONTHLY"?e.fixedMonthlyAmount:null};row.actualMinutes+=s.workedMinutes;row.overtimeMinutes+=s.overtimeMinutes;grouped.set(e.id,row);}
    const period=await prisma.workforcePayrollPeriod.create({data:{companyId:context.company.id,storeId:context.store.id,name,periodStart:from,periodEnd:to,createdByUserId:req.user?.id||null,lines:{create:[...grouped.values()].map(row=>({employeeId:row.employeeId,actualMinutes:row.actualMinutes,overtimeMinutes:row.overtimeMinutes,hourlyRate:row.hourlyRate,fixedAmount:row.fixedAmount,grossAmount:row.hourlyRate?Number((row.actualMinutes/60*Number(row.hourlyRate)).toFixed(2)):Number(row.fixedAmount||0),calculationJson:{source:"WORKFORCE_ATTENDANCE"}}))}}});
    res.status(201).json({id:period.id,status:period.status,message:"Η περίοδος μισθοδοσίας δημιουργήθηκε ως προσχέδιο."});
  }catch(error){next(error)}
});

router.get("/periods",async(req,res,next)=>{try{const context=await contextFor(req);res.json(await prisma.workforcePayrollPeriod.findMany({where:{companyId:context.company.id,storeId:context.store.id},include:{_count:{select:{lines:true}}},orderBy:{periodStart:"desc"},take:100}));}catch(error){next(error)}});
router.get("/periods/:id",async(req,res,next)=>{try{const context=await contextFor(req),period=await prisma.workforcePayrollPeriod.findFirst({where:{id:req.params.id,companyId:context.company.id,storeId:context.store.id},include:{lines:{include:{employee:{select:{fullName:true}}}},payments:true}});if(!period)return res.status(404).json({error:"Δεν βρέθηκε η περίοδος."});const paid=new Map();for(const p of period.payments)paid.set(p.employeeId,(paid.get(p.employeeId)||0)+Number(p.amount));res.json({...period,lines:period.lines.map(line=>({...line,employeeName:line.employee.fullName,paidAmount:Number(paid.get(line.employeeId)||0),balanceAmount:Number(line.grossAmount)-Number(paid.get(line.employeeId)||0)}))});}catch(error){next(error)}});
router.post("/periods/:id/payments",async(req,res,next)=>{try{const context=await contextFor(req),amount=Number(req.body?.amount),employeeId=String(req.body?.employeeId||"");if(!(amount>0)||!employeeId)return res.status(400).json({error:"Συμπλήρωσε εργαζόμενο και έγκυρο ποσό."});const period=await prisma.workforcePayrollPeriod.findFirst({where:{id:req.params.id,companyId:context.company.id,storeId:context.store.id}});if(!period||period.status!=="DRAFT")return res.status(409).json({error:"Η περίοδος δεν είναι ανοικτή για πληρωμή."});const payment=await prisma.workforceEmployeePayment.create({data:{companyId:context.company.id,storeId:context.store.id,employeeId,payrollPeriodId:period.id,paymentDate:new Date(),paymentType:"PAYROLL",amount,paymentMethod:String(req.body?.paymentMethod||"OTHER"),note:req.body?.note||null,createdByUserId:req.user?.id||null}});res.status(201).json({id:payment.id,message:"Η πληρωμή υπαλλήλου καταχωρίστηκε και αφαιρέθηκε από το υπόλοιπο."});}catch(error){next(error)}});
export default router;
