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
export default router;
