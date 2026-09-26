export const PAYROLLABLE_ATTENDANCE_STATUSES=Object.freeze(["CLOSED","APPROVED","COMPLETED"]);

export function payrollableAttendanceWhere(){
  return {in:[...PAYROLLABLE_ATTENDANCE_STATUSES]};
}

export function paymentBalance({grossAmount,paidAmount=0,newAmount}){
  const gross=Number(grossAmount),paid=Number(paidAmount),amount=Number(newAmount);
  if(!Number.isFinite(gross)||gross<0||!Number.isFinite(paid)||paid<0||!Number.isFinite(amount)||amount<=0){
    return {valid:false,reason:"INVALID_AMOUNT"};
  }
  const balance=Number((gross-paid).toFixed(2));
  if(amount>balance+0.00001)return {valid:false,reason:"OVERPAYMENT",balance};
  return {valid:true,paidAfter:Number((paid+amount).toFixed(2)),balanceAfter:Number((balance-amount).toFixed(2))};
}

export function payrollWorkDate(value,timeZone="Europe/Athens"){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}

export function payrollGross({paymentType,actualMinutes=0,hourlyRate=null,dailyRate=null,workDays=0,fixedAmount=null}){
  if(paymentType==="HOURLY")return hourlyRate===null?null:Number((Number(actualMinutes)/60*Number(hourlyRate)).toFixed(2));
  if(paymentType==="DAILY")return dailyRate===null?null:Number((Number(workDays)*Number(dailyRate)).toFixed(2));
  if(paymentType==="FIXED_MONTHLY")return fixedAmount===null?null:Number(Number(fixedAmount).toFixed(2));
  return null;
}

export function shiftDurationMinutes(startTime,endTime){
  const parse=value=>{const match=String(value||"").match(/^(\d{2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):null};
  const start=parse(startTime),end=parse(endTime);
  if(start===null||end===null)return 0;
  return end>start?end-start:1440-start+end;
}

export function overlapDays(startDate,endDate,periodStart,periodEnd){
  const day=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?null:Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())};
  const start=Math.max(day(startDate)??Infinity,day(periodStart)??Infinity),end=Math.min(day(endDate)??-Infinity,(day(periodEnd)??-Infinity)-86400000);
  return end<start?0:Math.floor((end-start)/86400000)+1;
}

export function payrollClosingSummary(lines,payments){
  const paidByEmployee=new Map();
  for(const payment of payments||[])paidByEmployee.set(payment.employeeId,Number(((paidByEmployee.get(payment.employeeId)||0)+Number(payment.amount||0)).toFixed(2)));
  const rows=(lines||[]).map(line=>{const grossAmount=Number(line.grossAmount||0),paidAmount=Number(paidByEmployee.get(line.employeeId)||0),balanceAmount=Number((grossAmount-paidAmount).toFixed(2));return {employeeId:line.employeeId,grossAmount,paidAmount,balanceAmount}});
  return {employeeCount:rows.length,grossAmount:Number(rows.reduce((sum,row)=>sum+row.grossAmount,0).toFixed(2)),paidAmount:Number(rows.reduce((sum,row)=>sum+row.paidAmount,0).toFixed(2)),balanceAmount:Number(rows.reduce((sum,row)=>sum+row.balanceAmount,0).toFixed(2)),openEmployeeCount:rows.filter(row=>Math.abs(row.balanceAmount)>0.009).length,rows};
}

export function reconcilePayrollDraft(lines,previousLines,payments){
  const paid=new Map();for(const payment of payments||[])paid.set(payment.employeeId,Number(((paid.get(payment.employeeId)||0)+Number(payment.amount)).toFixed(2)));
  if((previousLines||[]).some(line=>!lines.some(row=>row.employeeId===line.employeeId)&&(paid.get(line.employeeId)||0)>0))return {valid:false,reason:"MISSING_PAID_EMPLOYEE"};
  const rows=lines.map(row=>{const paidAmount=paid.get(row.employeeId)||0;return {...row,paidAmount,balanceAmount:Number((row.grossAmount-paidAmount).toFixed(2))}});
  if(rows.some(row=>row.balanceAmount<0))return {valid:false,reason:"OVERPAYMENT"};
  const totals={grossAmount:Number(rows.reduce((sum,row)=>sum+row.grossAmount,0).toFixed(2)),paidAmount:Number([...paid.values()].reduce((sum,value)=>sum+value,0).toFixed(2)),balanceAmount:Number(rows.reduce((sum,row)=>sum+row.balanceAmount,0).toFixed(2))};
  return {valid:true,rows,totals};
}
