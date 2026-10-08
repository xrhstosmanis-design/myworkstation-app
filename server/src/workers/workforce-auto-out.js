import {backgroundDrain} from "../server-shutdown.js";
import {prisma} from "../prisma.js";

const AUTO_OUT_MS=12*60*60*1000;
let timer=null,running=false;

export async function closeStaleWorkforceAttendance(now=new Date()){
  if(running)return {closed:0,skipped:"RUNNING"};
  running=true;
  try{
    const cutoff=new Date(now.getTime()-AUTO_OUT_MS);
    const candidates=await prisma.workforceAttendanceSession.findMany({where:{status:"OPEN",startedAt:{lte:cutoff}},select:{id:true}});
    let closed=0;
    for(const candidate of candidates){
      if(backgroundDrain.stopping)break;
      const changed=await prisma.$transaction(async tx=>{
        await tx.$queryRawUnsafe(`SELECT "id" FROM "WorkforceAttendanceSession" WHERE "id"=$1 FOR UPDATE`,candidate.id);
        const session=await tx.workforceAttendanceSession.findFirst({where:{id:candidate.id,status:"OPEN"}});
        if(!session||new Date(session.startedAt)>cutoff)return false;
        const endedAt=new Date(new Date(session.startedAt).getTime()+AUTO_OUT_MS),workedMinutes=720;
        const entry=await tx.workforceTimeClockEntry.create({data:{companyId:session.companyId,storeId:session.storeId,employeeId:session.employeeId,eventType:"OUT",method:"AUTO_OUT_12H",occurredAt:endedAt,sourceShiftId:session.scheduledAssignmentId||null,note:"Αυτόματη αποχώρηση ασφαλείας στις 12 ώρες — απαιτείται έλεγχος πραγματικής ώρας αποχώρησης.",createdByUserId:null}});
        const priorIssues=Array.isArray(session.issueJson?.issues)?session.issueJson.issues:[];
        const item=await tx.workforceAttendanceSession.update({where:{id:session.id},data:{clockOutEntryId:entry.id,endedAt,workedMinutes,overtimeMinutes:Math.max(Number(session.overtimeMinutes||0),240),status:"NEEDS_APPROVAL",issueJson:{...(session.issueJson||{}),issues:[...priorIssues.filter(issue=>issue?.code!=="AUTO_OUT_12H"),{code:"AUTO_OUT_12H",message:"Αυτόματη αποχώρηση στις 12 ώρες. Απαιτείται έλεγχος και επιβεβαίωση της πραγματικής ώρας αποχώρησης."}],autoOutAt:endedAt.toISOString(),autoOutReason:"SAFETY_12_HOURS"}}});
        await tx.workforceAuditLog.create({data:{companyId:session.companyId,storeId:session.storeId,actorUserId:null,action:"WORKFORCE_AUTO_OUT_12H",entityType:"WORKFORCE_ATTENDANCE_SESSION",entityId:item.id,beforeJson:{status:"OPEN",startedAt:session.startedAt},afterJson:{employeeId:session.employeeId,eventType:"OUT",method:"AUTO_OUT_12H",endedAt,workedMinutes,status:"NEEDS_APPROVAL"},reason:"Αυτόματη αποχώρηση ασφαλείας μετά από 12 ώρες χωρίς καταγεγραμμένο OUT. Απαιτείται έλεγχος από Ιδιοκτήτη/Super Admin."}});
        return true;
      });
      if(changed)closed++;
    }
    return {closed};
  }finally{running=false}
}

export function startWorkforceAutoOutWorker(){
  if(backgroundDrain.stopping)return;
  const run=()=>{if(backgroundDrain.stopping)return;return backgroundDrain.track(closeStaleWorkforceAttendance().catch(error=>console.error("Workforce AUTO_OUT_12H worker failed:",error?.message||error)))};
  run();
  if(timer)clearInterval(timer);
  timer=setInterval(run,5*60*1000);
  timer.unref?.();
  backgroundDrain.onStop(()=>clearInterval(timer));
}
