
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import {isSuperAdmin,requireAiStaffScheduler,storePaidModuleState} from "../store-paid-modules.js";
import {sendEmail} from "../services/mail.js";

const router=Router();
router.use(auth);
const storeScope=(req,storeId)=>({id:storeId,...(isSuperAdmin(req.user)?{}:{companyId:req.user.companyId})});

router.get("/dashboard",async(req,res,next)=>{
  try{
    const [stores,employees,temporary]=await Promise.all([
      prisma.store.count({where:{companyId:req.user.companyId,active:true}}),
      prisma.employee.count({where:{store:{companyId:req.user.companyId},active:true}}),
      prisma.employee.count({where:{store:{companyId:req.user.companyId},active:true,type:"TEMPORARY"}})
    ]);
    const latest=await prisma.schedule.findFirst({
      where:{store:{companyId:req.user.companyId}},
      orderBy:{weekStart:"desc"},
      include:{assignments:true}
    });
    const uncovered=latest ? latest.assignments.filter(a=>!a.employeeId).length : 0;
    res.json({stores,employees,temporary,uncovered});
  }catch(e){next(e)}
});

router.get("/stores",async(req,res,next)=>{
  try{
    res.json(await prisma.store.findMany({
      where:{companyId:req.user.companyId},
      include:{shifts:true},
      orderBy:{name:"asc"}
    }))
  }catch(e){next(e)}
});

router.post("/stores",async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().min(2),city:z.string().optional(),address:z.string().optional()}).parse(req.body);
    res.status(201).json(await prisma.store.create({data:{...body,companyId:req.user.companyId}}));
  }catch(e){next(e)}
});

router.get("/shifts",async(req,res,next)=>{
  try{
    const storeId=String(req.query.storeId||"");
    const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    res.json(await prisma.shiftType.findMany({where:{storeId,active:true},orderBy:{startTime:"asc"}}));
  }catch(e){next(e)}
});

router.get("/employees",async(req,res,next)=>{
  try{
    const employees=await prisma.employee.findMany({
      where:{store:{companyId:req.user.companyId}},
      include:{store:true,rules:{include:{shiftType:true}}},
      orderBy:{fullName:"asc"}
    });
    res.json(employees);
  }catch(e){next(e)}
});

router.post("/employees",async(req,res,next)=>{
  try{
    const body=z.object({
      fullName:z.string().min(2),position:z.string().optional(),phone:z.string().optional(),
      email:z.string().email().optional().or(z.literal("")),type:z.enum(["PERMANENT","TEMPORARY"]),
      storeId:z.string(),maxDaysPerWeek:z.number().int().min(1).max(6),allowSixthDay:z.boolean()
    }).parse(req.body);
    const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    res.status(201).json(await prisma.employee.create({data:{...body,email:body.email||null,maxHoursPerWeek:body.maxDaysPerWeek*8}}));
  }catch(e){next(e)}
});

router.put("/employees/:id",async(req,res,next)=>{
  try{
    const body=z.object({
      fullName:z.string().min(2),position:z.string().optional().nullable(),phone:z.string().optional().nullable(),
      email:z.string().email().optional().or(z.literal("")).nullable(),
      type:z.enum(["PERMANENT","TEMPORARY"]),storeId:z.string(),
      maxDaysPerWeek:z.number().int().min(1).max(6),allowSixthDay:z.boolean(),
      maxHoursPerWeek:z.number().int().min(8).max(72)
    }).parse(req.body);
    const employee=await prisma.employee.findFirst({where:{id:req.params.id,store:{companyId:req.user.companyId}}});
    if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος."});
    const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    res.json(await prisma.employee.update({
      where:{id:employee.id},
      data:{...body,email:body.email||null}
    }));
  }catch(e){next(e)}
});

router.patch("/employees/:id/status",async(req,res,next)=>{
  try{
    const employee=await prisma.employee.findFirst({where:{id:req.params.id,store:{companyId:req.user.companyId}}});
    if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος."});
    res.json(await prisma.employee.update({where:{id:employee.id},data:{active:!employee.active}}));
  }catch(e){next(e)}
});

router.put("/employees/:id/rules",async(req,res,next)=>{
  try{
    const body=z.object({
      rules:z.array(z.object({
        shiftTypeId:z.string(),
        allowed:z.boolean(),
        targetPerWeek:z.number().int().min(0).max(7).nullable().optional(),
        priority:z.number().int().min(-100).max(100).default(0),
        note:z.string().optional().nullable()
      }))
    }).parse(req.body);
    const employee=await prisma.employee.findFirst({
      where:{id:req.params.id,store:{companyId:req.user.companyId}},
      include:{store:true}
    });
    if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος."});
    const validShiftIds=new Set((await prisma.shiftType.findMany({where:{storeId:employee.storeId},select:{id:true}})).map(s=>s.id));
    if(body.rules.some(r=>!validShiftIds.has(r.shiftTypeId)))return res.status(400).json({error:"Μη έγκυρη βάρδια."});
    await prisma.$transaction([
      prisma.employeeRule.deleteMany({where:{employeeId:employee.id}}),
      prisma.employeeRule.createMany({data:body.rules.map(r=>({
        employeeId:employee.id,shiftTypeId:r.shiftTypeId,allowed:r.allowed,
        targetPerWeek:r.targetPerWeek ?? null,priority:r.priority,note:r.note||null,fixedWeekdays:[]
      }))})
    ]);
    res.json(await prisma.employee.findUnique({where:{id:employee.id},include:{rules:{include:{shiftType:true}}}}));
  }catch(e){next(e)}
});


function mondayOf(date){
  const d=new Date(date);
  const day=d.getUTCDay();
  const diff=day===0?-6:1-day;
  d.setUTCDate(d.getUTCDate()+diff);
  d.setUTCHours(0,0,0,0);
  return d;
}
function dateKey(d){return d.toISOString().slice(0,10)}
let scheduleBriefSchemaPromise;
async function ensureScheduleBriefSchema(){
  if(!scheduleBriefSchemaPromise)scheduleBriefSchemaPromise=prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ScheduleGenerationBrief" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"dateFrom" TIMESTAMPTZ NOT NULL,"dateTo" TIMESTAMPTZ NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',"shiftOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb,"updatedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE ("storeId","dateFrom","dateTo"))`).catch(error=>{scheduleBriefSchemaPromise=undefined;throw error});
  return scheduleBriefSchemaPromise;
}
const briefSchema=z.object({storeId:z.string(),dateFrom:z.string().optional(),dateTo:z.string().optional(),instructions:z.string().max(12000).default(""),shiftOverrides:z.record(z.object({requiredCount:z.coerce.number().int().min(0).max(20).optional(),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()})).default({})});
const plain=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const briefWeekdays=[["ΔΕΥΤΕΡ",0],["ΤΡΙΤ",1],["ΤΕΤΑΡΤ",2],["ΠΕΜΠΤ",3],["ΠΑΡΑΣΚΕΥ",4],["ΣΑΒΒΑΤ",5],["ΚΥΡΙΑΚ",6]];
function applyWrittenRules(employees,shifts,instructions,dateFrom,dateTo){
  const lines=String(instructions||"").split(/\r?\n|;/).map(plain).filter(Boolean);
  for(const employee of employees){
    const names=plain(employee.fullName).split(/\s+/).filter(x=>x.length>=3),ownLines=lines.filter(line=>names.some(name=>line.includes(name)));employee._briefUnavailableDates=new Set();
    for(const line of ownLines){
      if(line.includes("ΧΩΡΙΣ ΡΕΠΟ")){employee.maxDaysPerWeek=7;employee.allowSixthDay=true;employee.maxHoursPerWeek=Math.max(employee.maxHoursPerWeek,72)}
      const mentioned=shifts.filter(shift=>line.includes(plain(shift.name))||line.includes(plain(shift.code)));
      if(line.includes("ΜΟΝΟ")&&mentioned.length)employee.rules=employee.rules.filter(rule=>mentioned.some(shift=>shift.id===rule.shiftTypeId));
      if((line.includes("ΠΑΝΤΑ")||line.includes("ΣΤΑΘΕΡ"))&&mentioned.length)for(const rule of employee.rules)if(mentioned.some(shift=>shift.id===rule.shiftTypeId))rule.priority=Math.max(rule.priority||0,100);
      for(const [word,weekday] of briefWeekdays)if(line.includes("ΡΕΠΟ")&&line.includes(word)){for(let d=new Date(dateFrom);d<=dateTo;d.setUTCDate(d.getUTCDate()+1))if((d.getUTCDay()+6)%7===weekday)employee._briefUnavailableDates.add(dateKey(d))}
    }
  }
}
router.get("/schedules/brief",async(req,res,next)=>{try{
  await ensureScheduleBriefSchema();const storeId=String(req.query.storeId||""),store=await prisma.store.findFirst({where:storeScope(req,storeId),select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const dateFrom=new Date(String(req.query.dateFrom||dateKey(mondayOf(new Date())))),dateTo=new Date(String(req.query.dateTo||dateKey(new Date(dateFrom.getTime()+6*86400000))));
  const rows=await prisma.$queryRaw`SELECT "instructions","shiftOverrides","updatedAt" FROM "ScheduleGenerationBrief" WHERE "storeId"=${store.id} AND "dateFrom"=${dateFrom} AND "dateTo"=${dateTo} LIMIT 1`;res.json(rows[0]||{instructions:"",shiftOverrides:{},updatedAt:null});
}catch(e){next(e)}});
function hoursForShift(shift){
  const [sh,sm]=shift.startTime.split(":").map(Number);
  const [eh,em]=shift.endTime.split(":").map(Number);
  let minutes=(eh*60+em)-(sh*60+sm);
  if(minutes<=0)minutes+=24*60;
  return minutes/60;
}
function dayIndex(date,weekStart){
  return Math.round((new Date(date)-new Date(weekStart))/(24*60*60*1000));
}
function isUnavailable(emp,currentDate){
  const dayStart=new Date(currentDate); dayStart.setUTCHours(0,0,0,0);
  const unavailable=emp.availability?.some(a=>new Date(a.date).getTime()===dayStart.getTime() && !a.available);
  const onLeave=emp.leaveRequests?.some(l=>dayStart>=new Date(l.startDate) && dayStart<=new Date(l.endDate));
  return unavailable||onLeave||emp._briefUnavailableDates?.has(dateKey(dayStart));
}
function violatesRest(emp,shift,currentDate,history){
  const previous=new Date(currentDate);
  previous.setUTCDate(previous.getUTCDate()-1);
  const prev=history[emp.id]?.[dateKey(previous)];
  if(!prev)return false;
  // Hard rule: no morning/delivery/manager immediately after night.
  if(prev.code==="NIGHT" && ["MORNING","DELIVERY","MANAGER"].includes(shift.code))return true;
  return false;
}
function consecutiveDays(emp,currentDate,history){
  let count=0;
  const d=new Date(currentDate);
  for(let i=1;i<=7;i++){
    d.setUTCDate(d.getUTCDate()-1);
    if(history[emp.id]?.[dateKey(d)])count++;
    else break;
  }
  return count;
}
function candidateScore({emp,shift,counts,assignedToday,isWeekend,currentDate,history}){
  if(!emp.active||assignedToday.has(emp.id))return null;
  if(isUnavailable(emp,currentDate))return null;
  const rule=emp.rules.find(r=>r.shiftTypeId===shift.id && r.allowed);
  if(!rule)return null;
  if(violatesRest(emp,shift,currentDate,history))return null;

  const totalDays=counts[emp.id]?.days||0;
  const totalHours=counts[emp.id]?.hours||0;
  const shiftHours=hoursForShift(shift);
  const maxDays=emp.allowSixthDay?Math.max(emp.maxDaysPerWeek,6):emp.maxDaysPerWeek;
  if(totalDays>=maxDays)return null;
  if(totalHours+shiftHours>emp.maxHoursPerWeek)return null;

  const consecutive=consecutiveDays(emp,currentDate,history);
  if(consecutive>=6)return null;

  let score=100;
  const reasons=[];

  // Fairness: fewer days/hours receive priority.
  score-=totalDays*12;
  score-=totalHours*0.8;
  reasons.push(`${totalDays} ημέρες / ${totalHours} ώρες`);

  // Permanent staff first; temporary only when genuinely needed.
  if(emp.type==="TEMPORARY"){
    score-=45;
    reasons.push("έκτακτος");
  }else{
    score+=10;
  }

  // Weekly target for shift.
  const currentShiftCount=counts[emp.id]?.byShift?.[shift.id]||0;
  if(rule.targetPerWeek!=null){
    if(currentShiftCount<rule.targetPerWeek){
      score+=45;
      reasons.push(`στόχος ${currentShiftCount}/${rule.targetPerWeek}`);
    }else{
      score-=35;
      reasons.push("ο στόχος έχει καλυφθεί");
    }
  }

  score+=(rule.priority||0);

  // Avoid too many consecutive workdays.
  score-=consecutive*8;
  if(consecutive>=4)reasons.push(`${consecutive} συνεχόμενες ημέρες`);

  // Weekend fairness.
  if(isWeekend){
    const weekends=counts[emp.id]?.weekendDays||0;
    score-=weekends*18;
    reasons.push(`${weekends} ημέρες Σ/Κ`);
  }

  // Fixed operational roles.
  if(shift.code==="DELIVERY" && emp.position==="Delivery")score+=80;
  if(shift.code==="MANAGER" && emp.position==="Υπεύθυνος")score+=80;

  return {emp,score,reasons,rule};
}
function chooseEmployee(args){
  const ranked=args.employees
    .map(emp=>candidateScore({...args,emp}))
    .filter(Boolean)
    .sort((a,b)=>b.score-a.score || a.emp.fullName.localeCompare(b.emp.fullName,"el"));
  return {chosen:ranked[0]||null,ranked};
}
function buildMetrics({planned,employees,shifts,counts,warnings,explanations}){
  const totalSlots=planned.length;
  const covered=planned.filter(p=>p.employeeId).length;
  const temporaryAssignments=planned.filter(p=>{
    const e=employees.find(x=>x.id===p.employeeId);
    return e?.type==="TEMPORARY";
  }).length;
  const hardViolations=0;
  const coverageScore=totalSlots?Math.round((covered/totalSlots)*55):0;
  const hardScore=hardViolations===0?25:Math.max(0,25-hardViolations*5);
  const assignedCounts=Object.values(counts).filter(c=>c.days>0).map(c=>c.hours);
  const spread=assignedCounts.length?Math.max(...assignedCounts)-Math.min(...assignedCounts):0;
  const fairnessScore=Math.max(0,15-Math.round(spread/4));
  const tempScore=Math.max(0,5-Math.min(5,temporaryAssignments));
  const quality=Math.max(0,Math.min(100,coverageScore+hardScore+fairnessScore+tempScore));
  return {
    quality,
    totalSlots,
    covered,
    uncovered:totalSlots-covered,
    coveragePercent:totalSlots?Math.round((covered/totalSlots)*100):100,
    temporaryAssignments,
    hardViolations,
    hoursSpread:spread,
    employeeSummary:employees.map(e=>({
      employeeId:e.id,
      fullName:e.fullName,
      type:e.type,
      days:counts[e.id]?.days||0,
      hours:counts[e.id]?.hours||0,
      morning:counts[e.id]?.byCode?.MORNING||0,
      middle:counts[e.id]?.byCode?.MIDDLE||0,
      afternoon:counts[e.id]?.byCode?.AFTERNOON||0,
      night:counts[e.id]?.byCode?.NIGHT||0,
      delivery:counts[e.id]?.byCode?.DELIVERY||0,
      manager:counts[e.id]?.byCode?.MANAGER||0
    })),
    warnings,
    explanations
  };
}

router.post("/schedules/generate",async(req,res,next)=>{
  try{
    const body=briefSchema.parse(req.body);
    await requireAiStaffScheduler(req,body.storeId);
    const store=await prisma.store.findFirst({
      where:storeScope(req,body.storeId),
      include:{
        shifts:{where:{active:true}},
        employees:{
          where:{active:true},
          include:{rules:true,availability:true,leaveRequests:{where:{status:"APPROVED"}}}
        }
      }
    });
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});

    const dateFrom=body.dateFrom?new Date(body.dateFrom):mondayOf(new Date()),dateTo=body.dateTo?new Date(body.dateTo):new Date(dateFrom.getTime()+6*86400000);
    dateFrom.setUTCHours(0,0,0,0);dateTo.setUTCHours(0,0,0,0);
    const periodDays=Math.floor((dateTo-dateFrom)/86400000)+1;if(periodDays<1||periodDays>62)return res.status(400).json({error:"Η περίοδος πρέπει να είναι από 1 έως 62 ημέρες."});
    const weekStart=dateFrom;
    await ensureScheduleBriefSchema();const briefId=`${store.id}:${dateKey(dateFrom)}:${dateKey(dateTo)}`;
    await prisma.$executeRaw`INSERT INTO "ScheduleGenerationBrief" ("id","companyId","storeId","dateFrom","dateTo","instructions","shiftOverrides","updatedBy") VALUES (${briefId},${store.companyId},${store.id},${dateFrom},${dateTo},${body.instructions},${JSON.stringify(body.shiftOverrides)}::jsonb,${req.user.id||req.user.email||req.user.role||null}) ON CONFLICT ("storeId","dateFrom","dateTo") DO UPDATE SET "instructions"=EXCLUDED."instructions","shiftOverrides"=EXCLUDED."shiftOverrides","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
    store.shifts=store.shifts.map(shift=>({...shift,...(body.shiftOverrides[shift.id]||{})}));applyWrittenRules(store.employees,store.shifts,body.instructions,dateFrom,dateTo);
    const counts=Object.fromEntries(store.employees.map(e=>[e.id,{
      days:0,hours:0,weekendDays:0,byShift:{},byCode:{}
    }]));
    const history=Object.fromEntries(store.employees.map(e=>[e.id,{}]));
    const planned=[];
    const warnings=[];
    const explanations=[];

    // Fill specialist shifts first, then night, intermediate, afternoon, morning.
    const order={MANAGER:0,DELIVERY:1,NIGHT:2,MIDDLE:3,AFTERNOON:4,MORNING:5};
    const orderedShifts=[...store.shifts].sort((a,b)=>(order[a.code]??10)-(order[b.code]??10));

    for(let offset=0;offset<periodDays;offset++){
      const date=new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate()+offset);
      const weekday=date.getUTCDay();
      const isWeekend=weekday===0||weekday===6;
      const assignedToday=new Set();

      for(const shift of orderedShifts){
        if((shift.code==="DELIVERY"||shift.code==="MANAGER")&&isWeekend)continue;
        for(let slot=1;slot<=shift.requiredCount;slot++){
          const {chosen,ranked}=chooseEmployee({
            employees:store.employees,shift,counts,assignedToday,isWeekend,currentDate:date,history
          });
          const emp=chosen?.emp||null;

          if(emp){
            assignedToday.add(emp.id);
            counts[emp.id].days++;
            const shiftHours=hoursForShift(shift);
            counts[emp.id].hours+=shiftHours;
            counts[emp.id].byShift[shift.id]=(counts[emp.id].byShift[shift.id]||0)+1;
            counts[emp.id].byCode[shift.code]=(counts[emp.id].byCode[shift.code]||0)+1;
            if(isWeekend)counts[emp.id].weekendDays++;
            history[emp.id][dateKey(date)]={code:shift.code,shiftTypeId:shift.id};
            explanations.push({
              date:dateKey(date),shift:shift.name,employee:emp.fullName,
              reason:chosen.reasons.join(" · "),score:Math.round(chosen.score)
            });
          }else{
            const possible=ranked.slice(0,3).map(x=>x.emp.fullName);
            warnings.push({
              type:"UNCOVERED",
              date:dateKey(date),
              shift:shift.name,
              slot,
              message:`${dateKey(date)} · ${shift.name}: ακάλυπτη θέση ${slot}`,
              suggestions:possible
            });
          }
          planned.push({date,shiftTypeId:shift.id,employeeId:emp?.id||null,slot});
        }
      }
    }

    const metrics=buildMetrics({
      planned,employees:store.employees,shifts:store.shifts,counts,warnings,explanations
    });

    const schedule=await prisma.$transaction(async tx=>{
      const existing=await tx.schedule.findUnique({where:{storeId_weekStart:{storeId:store.id,weekStart}}});
      if(existing)await tx.scheduleAssignment.deleteMany({where:{scheduleId:existing.id}});
      const saved=existing
        ? await tx.schedule.update({where:{id:existing.id},data:{status:"DRAFT"}})
        : await tx.schedule.create({data:{storeId:store.id,weekStart,status:"DRAFT"}});
      await tx.scheduleAssignment.createMany({data:planned.map(p=>({...p,scheduleId:saved.id}))});
      return tx.schedule.findUnique({
        where:{id:saved.id},
        include:{assignments:{include:{employee:true,shiftType:true},orderBy:[{date:"asc"},{shiftType:{startTime:"asc"}},{slot:"asc"}]}}
      });
    });
    res.json({schedule,warnings,metrics});
  }catch(e){next(e)}
});

router.get("/schedules/:id/report",async(req,res,next)=>{
  try{
    const schedule=await prisma.schedule.findFirst({
      where:{id:req.params.id,...(isSuperAdmin(req.user)?{}:{store:{companyId:req.user.companyId}})},
      include:{
        store:true,
        assignments:{include:{employee:true,shiftType:true},orderBy:[{date:"asc"},{shiftType:{startTime:"asc"}}]}
      }
    });
    if(!schedule)return res.status(404).json({error:"Δεν βρέθηκε πρόγραμμα."});
    await requireAiStaffScheduler(req,schedule.storeId);
    const map={};
    for(const a of schedule.assignments){
      if(!a.employee)continue;
      const row=map[a.employee.id]??={
        employeeId:a.employee.id,fullName:a.employee.fullName,type:a.employee.type,
        days:new Set(),hours:0,morning:0,middle:0,afternoon:0,night:0,delivery:0,manager:0
      };
      row.days.add(dateKey(a.date));
      row.hours+=hoursForShift(a.shiftType);
      const key=a.shiftType.code.toLowerCase();
      if(key in row)row[key]++;
    }
    res.json({
      store:schedule.store.name,
      weekStart:schedule.weekStart,
      rows:Object.values(map).map(r=>({...r,days:r.days.size})),
      uncovered:schedule.assignments.filter(a=>!a.employeeId).length
    });
  }catch(e){next(e)}
});

router.get("/schedules/module-state",async(req,res,next)=>{try{
  const storeId=String(req.query.storeId||"");
  const store=await prisma.store.findFirst({where:storeScope(req,storeId),select:{id:true}});
  if(!store&&!isSuperAdmin(req.user))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  res.json(isSuperAdmin(req.user)?{active:true,superAdminBypass:true}:await storePaidModuleState(store.id));
}catch(e){next(e)}});

router.post("/schedules/:id/email",async(req,res,next)=>{try{
  const schedule=await prisma.schedule.findFirst({where:{id:req.params.id,...(isSuperAdmin(req.user)?{}:{store:{companyId:req.user.companyId}})},include:{store:true,assignments:{include:{employee:true,shiftType:true},orderBy:[{date:"asc"},{shiftType:{startTime:"asc"}}]}}});
  if(!schedule)return res.status(404).json({error:"Δεν βρέθηκε πρόγραμμα."});
  await requireAiStaffScheduler(req,schedule.storeId);
  const recipients=[...new Set(schedule.assignments.map(row=>row.employee?.email).filter(Boolean))];
  if(!recipients.length)return res.status(422).json({error:"Δεν υπάρχουν email στους εργαζομένους του προγράμματος."});
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const rows=schedule.assignments.filter(row=>row.employee).map(row=>`<tr><td>${esc(new Date(row.date).toLocaleDateString("el-GR"))}</td><td>${esc(row.shiftType.name)}</td><td>${esc(`${row.shiftType.startTime}-${row.shiftType.endTime}`)}</td><td><b>${esc(row.employee.fullName)}</b></td></tr>`).join("");
  const week=new Date(schedule.weekStart).toLocaleDateString("el-GR");
  const html=`<div style="font-family:Arial,sans-serif"><h2>Πρόγραμμα εργαζομένων · ${esc(schedule.store.name)}</h2><p>Εβδομάδα ${esc(week)}</p><table style="border-collapse:collapse;width:100%"><tr><th>Ημερομηνία</th><th>Βάρδια</th><th>Ώρα</th><th>Εργαζόμενος</th></tr>${rows}</table><p>Αυτόματο μήνυμα από το MyWorkStation.</p></div>`;
  const result=await sendEmail({to:recipients,subject:`Πρόγραμμα εργασίας · ${schedule.store.name} · ${week}`,text:`Το πρόγραμμα εργασίας για την εβδομάδα ${week} είναι διαθέσιμο στο συνημμένο μήνυμα.`,html});
  res.json({sent:true,recipients:result.recipients});
}catch(e){next(e)}});

router.get("/schedules/latest",async(req,res,next)=>{
  try{
    const storeId=String(req.query.storeId||"");
    const store=await prisma.store.findFirst({where:storeScope(req,storeId)});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    const schedule=await prisma.schedule.findFirst({
      where:{storeId},orderBy:{weekStart:"desc"},
      include:{assignments:{include:{employee:true,shiftType:true},orderBy:[{date:"asc"},{shiftType:{startTime:"asc"}},{slot:"asc"}]}}
    });
    res.json(schedule);
  }catch(e){next(e)}
});


router.get("/availability",async(req,res,next)=>{
  try{
    const employeeId=String(req.query.employeeId||"");
    const employee=await prisma.employee.findFirst({
      where:{id:employeeId,store:{companyId:req.user.companyId}}
    });
    if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος."});
    res.json(await prisma.availability.findMany({
      where:{employeeId},
      orderBy:{date:"asc"}
    }));
  }catch(e){next(e)}
});

router.post("/availability",async(req,res,next)=>{
  try{
    const body=z.object({
      employeeId:z.string(),
      date:z.string(),
      available:z.boolean(),
      note:z.string().optional().nullable()
    }).parse(req.body);
    const employee=await prisma.employee.findFirst({
      where:{id:body.employeeId,store:{companyId:req.user.companyId}}
    });
    if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος."});
    const date=new Date(body.date+"T00:00:00.000Z");
    res.json(await prisma.availability.upsert({
      where:{employeeId_date:{employeeId:employee.id,date}},
      update:{available:body.available,note:body.note||null},
      create:{employeeId:employee.id,date,available:body.available,note:body.note||null}
    }));
  }catch(e){next(e)}
});

router.get("/leaves",async(req,res,next)=>{
  try{
    res.json(await prisma.leaveRequest.findMany({
      where:{employee:{store:{companyId:req.user.companyId}}},
      include:{employee:true},
      orderBy:{startDate:"desc"}
    }));
  }catch(e){next(e)}
});

router.post("/leaves",async(req,res,next)=>{
  try{
    const body=z.object({
      employeeId:z.string(),
      startDate:z.string(),
      endDate:z.string(),
      type:z.enum(["LEAVE","SICK","OTHER"]),
      note:z.string().optional().nullable()
    }).parse(req.body);
    const employee=await prisma.employee.findFirst({
      where:{id:body.employeeId,store:{companyId:req.user.companyId}}
    });
    if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος."});
    res.status(201).json(await prisma.leaveRequest.create({
      data:{
        employeeId:employee.id,
        startDate:new Date(body.startDate+"T00:00:00.000Z"),
        endDate:new Date(body.endDate+"T23:59:59.999Z"),
        type:body.type,
        status:"APPROVED",
        note:body.note||null
      },
      include:{employee:true}
    }));
  }catch(e){next(e)}
});

router.patch("/leaves/:id/status",async(req,res,next)=>{
  try{
    const body=z.object({status:z.enum(["PENDING","APPROVED","REJECTED"])}).parse(req.body);
    const leave=await prisma.leaveRequest.findFirst({
      where:{id:req.params.id,employee:{store:{companyId:req.user.companyId}}}
    });
    if(!leave)return res.status(404).json({error:"Δεν βρέθηκε αίτημα."});
    res.json(await prisma.leaveRequest.update({
      where:{id:leave.id},data:{status:body.status},include:{employee:true}
    }));
  }catch(e){next(e)}
});

router.patch("/assignments/:id",async(req,res,next)=>{
  try{
    const body=z.object({employeeId:z.string().nullable()}).parse(req.body);
    const assignment=await prisma.scheduleAssignment.findFirst({
      where:{id:req.params.id,schedule:{store:{companyId:req.user.companyId}}},
      include:{schedule:true,shiftType:true}
    });
    if(!assignment)return res.status(404).json({error:"Δεν βρέθηκε ανάθεση."});
    if(body.employeeId){
      const employee=await prisma.employee.findFirst({
        where:{
          id:body.employeeId,
          active:true,
          storeId:assignment.schedule.storeId,
          store:{companyId:req.user.companyId}
        },
        include:{rules:true}
      });
      if(!employee)return res.status(404).json({error:"Δεν βρέθηκε διαθέσιμος εργαζόμενος."});
      const allowed=employee.rules.some(r=>r.shiftTypeId===assignment.shiftTypeId && r.allowed);
      if(!allowed)return res.status(400).json({error:"Ο εργαζόμενος δεν επιτρέπεται σε αυτή τη βάρδια."});
      const duplicate=await prisma.scheduleAssignment.findFirst({
        where:{
          scheduleId:assignment.scheduleId,
          date:assignment.date,
          employeeId:employee.id,
          NOT:{id:assignment.id}
        }
      });
      if(duplicate)return res.status(400).json({error:"Ο εργαζόμενος έχει ήδη βάρδια αυτή την ημέρα."});
    }
    res.json(await prisma.scheduleAssignment.update({
      where:{id:assignment.id},
      data:{employeeId:body.employeeId},
      include:{employee:true,shiftType:true}
    }));
  }catch(e){next(e)}
});

router.get("/assignments/:id/candidates",async(req,res,next)=>{
  try{
    const assignment=await prisma.scheduleAssignment.findFirst({
      where:{id:req.params.id,schedule:{store:{companyId:req.user.companyId}}},
      include:{schedule:true}
    });
    if(!assignment)return res.status(404).json({error:"Δεν βρέθηκε ανάθεση."});
    const employees=await prisma.employee.findMany({
      where:{
        storeId:assignment.schedule.storeId,
        active:true,
        rules:{some:{shiftTypeId:assignment.shiftTypeId,allowed:true}}
      },
      include:{rules:true},
      orderBy:[{type:"asc"},{fullName:"asc"}]
    });
    const result=[];
    for(const employee of employees){
      const duplicate=await prisma.scheduleAssignment.findFirst({
        where:{
          scheduleId:assignment.scheduleId,
          date:assignment.date,
          employeeId:employee.id,
          NOT:{id:assignment.id}
        }
      });
      if(!duplicate)result.push(employee);
    }
    res.json(result);
  }catch(e){next(e)}
});

export default router;
