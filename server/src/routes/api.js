
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router=Router();
router.use(auth);

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
function chooseEmployee({employees,shift,counts,assignedToday,isWeekend,currentDate}){
  const ranked=employees.map(emp=>{
    if(!emp.active||assignedToday.has(emp.id))return null;
    const dayStart=new Date(currentDate); dayStart.setUTCHours(0,0,0,0);
    const unavailable=emp.availability?.some(a=>new Date(a.date).getTime()===dayStart.getTime() && !a.available);
    const onLeave=emp.leaveRequests?.some(l=>dayStart>=new Date(l.startDate) && dayStart<=new Date(l.endDate));
    if(unavailable||onLeave)return null;
    const rule=emp.rules.find(r=>r.shiftTypeId===shift.id && r.allowed);
    if(!rule)return null;
    const total=counts[emp.id]?.total||0;
    const maxDays=emp.allowSixthDay?Math.max(emp.maxDaysPerWeek,6):emp.maxDaysPerWeek;
    if(total>=maxDays)return null;
    let score=100-total*10+(rule.priority||0);
    if(emp.type==="TEMPORARY")score-=30;
    const current=counts[emp.id]?.[shift.id]||0;
    if(rule.targetPerWeek!=null){
      if(current<rule.targetPerWeek)score+=40;
      else score-=25;
    }
    if(isWeekend && emp.position==="Υπεύθυνος")score-=20;
    return {emp,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score || a.emp.fullName.localeCompare(b.emp.fullName,"el"));
  return ranked[0]?.emp||null;
}

router.post("/schedules/generate",async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string(),weekStart:z.string().optional()}).parse(req.body);
    const store=await prisma.store.findFirst({
      where:{id:body.storeId,companyId:req.user.companyId},
      include:{
        shifts:{where:{active:true}},
        employees:{where:{active:true},include:{rules:true,availability:true,leaveRequests:{where:{status:"APPROVED"}}}}
      }
    });
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    const weekStart=mondayOf(body.weekStart?new Date(body.weekStart):new Date());
    const counts=Object.fromEntries(store.employees.map(e=>[e.id,{total:0}]));
    const planned=[];
    const warnings=[];

    for(let offset=0;offset<7;offset++){
      const date=new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate()+offset);
      const weekday=date.getUTCDay();
      const isWeekend=weekday===0||weekday===6;
      const assignedToday=new Set();

      for(const shift of store.shifts){
        if((shift.code==="DELIVERY"||shift.code==="MANAGER")&&isWeekend)continue;
        for(let slot=1;slot<=shift.requiredCount;slot++){
          const emp=chooseEmployee({employees:store.employees,shift,counts,assignedToday,isWeekend,currentDate:date});
          if(emp){
            assignedToday.add(emp.id);
            counts[emp.id].total++;
            counts[emp.id][shift.id]=(counts[emp.id][shift.id]||0)+1;
          }else{
            warnings.push(`${dateKey(date)} · ${shift.name}: ακάλυπτη θέση ${slot}`);
          }
          planned.push({date,shiftTypeId:shift.id,employeeId:emp?.id||null,slot});
        }
      }
    }

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
    res.json({schedule,warnings});
  }catch(e){next(e)}
});

router.get("/schedules/latest",async(req,res,next)=>{
  try{
    const storeId=String(req.query.storeId||"");
    const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId}});
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
