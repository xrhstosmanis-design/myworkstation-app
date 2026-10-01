const zone='Europe/Athens';
function midnight(year,month){
 const target=Date.UTC(year,month-1,1);
 let instant=target;
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(fmt.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
  const local=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
  instant+=target-local;
 }
 return new Date(instant);
}
export function cashierMonthRange(month){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw Object.assign(new Error('Επίλεξε έγκυρο μήνα (2000–2100).'),{status:400});
 const [year,m]=month.split('-').map(Number);
 return {month,timeZone:zone,from:midnight(year,m),to:midnight(m===12?year+1:year,m===12?1:m+1),endExclusive:true};
}
const n=v=>Number(v||0),money=v=>Number(n(v).toFixed(2));
export function summarizeMonthlyShifts(rows){
 const summary={shifts:rows.length,openShifts:0,closedShifts:0,transactions:0,reversed:0,cashSales:0,cardSales:0,eftpos:0,variance:0,openingVariance:0,cardVariance:0};
 for(const row of rows){
  if(row.status==='OPEN')summary.openShifts++;
  if(row.closedInPeriod){summary.closedShifts++;summary.variance+=n(row.variance);summary.cardVariance+=n(row.cardVariance);summary.eftpos+=n(row.eftposTotal)}
  if(row.openedInPeriod)summary.openingVariance+=n(row.openingVariance);
  summary.transactions+=n(row.transactionCount);summary.reversed+=n(row.reversedCount);summary.cashSales+=n(row.cashSales);summary.cardSales+=n(row.cardSales);
 }
 for(const k of ['cashSales','cardSales','eftpos','variance','openingVariance','cardVariance'])summary[k]=money(summary[k]);
 return {...summary,totalSales:money(summary.cashSales+summary.cardSales)};
}
export async function monthlyCashierPerformance(db,{companyId,storeId,employee,month}){
 const period=cashierMonthRange(month),{from,to}=period;
 const operators=await db.$queryRaw`SELECT "id" FROM "StoreOperatorCredential" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employee.id}`;
 const operatorIds=operators.map(x=>x.id);
 const shifts=operatorIds.length?await db.$queryRaw`
 SELECT s."id",s."storeId",st."name" AS "storeName",s."terminalPos",s."status",s."openedAt",s."closedAt",
  (s."openedAt">=${from} AND s."openedAt"<${to}) AS "openedInPeriod",
  (s."status"='CLOSED' AND s."closedAt">=${from} AND s."closedAt"<${to}) AS "closedInPeriod",
  s."variance",s."openingVariance",s."cardVariance",s."eftposTotal",
  COUNT(t."id") FILTER (WHERE t."reversedAt" IS NULL)::int AS "transactionCount",
  COUNT(t."id") FILTER (WHERE t."reversedAt" IS NOT NULL)::int AS "reversedCount",
  COALESCE(SUM(t."amount") FILTER (WHERE t."type"='SALE_CASH' AND t."reversedAt" IS NULL),0) AS "cashSales",
  COALESCE(SUM(t."amount") FILTER (WHERE t."type" IN ('SALE_CARD','SALE_IRIS') AND t."reversedAt" IS NULL),0) AS "cardSales"
 FROM "CashShiftSession" s JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
 LEFT JOIN "StoreTransaction" t ON t."sessionId"=s."id" AND t."companyId"=s."companyId" AND t."storeId"=s."storeId" AND t."occurredAt">=${from} AND t."occurredAt"<${to}
 WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."openedBy"=ANY(${operatorIds}::text[])
 AND (t."id" IS NOT NULL OR (s."openedAt">=${from} AND s."openedAt"<${to}) OR (s."closedAt">=${from} AND s."closedAt"<${to}))
 GROUP BY s."id",st."name" ORDER BY s."openedAt" DESC LIMIT 251`:[];
 const sessions=await db.workforceAttendanceSession.findMany({where:{companyId,storeId,employeeId:employee.id,startedAt:{gte:from,lt:to}},orderBy:{startedAt:'desc'},take:501});
 const posActions=operatorIds.length?await db.$queryRaw`SELECT a."id",a."createdAt",a."actionType",a."reason",a."saleId",a."relatedSaleId",a."actorName",a."details",COALESCE(s."total",0) AS "amount" FROM "PosSaleActionAudit" a LEFT JOIN "Sale" s ON s."id"=a."saleId" AND s."companyId"=a."companyId" AND s."storeId"=a."storeId" WHERE a."companyId"=${companyId} AND a."storeId"=${storeId} AND a."actorId"=ANY(${operatorIds}::text[]) AND a."createdAt">=${from} AND a."createdAt"<${to} ORDER BY a."createdAt" DESC LIMIT 251`:[];
 const warnings=[];
 if(shifts.length>250)warnings.push('Περισσότερες από 250 βάρδιες: η προβολή και τα σύνολα είναι μερικά.');
 if(sessions.length>500)warnings.push('Περισσότερες από 500 παρουσίες: τα στοιχεία παρουσίας είναι μερικά.');
 if(posActions.length>250)warnings.push('Περισσότερες από 250 ενέργειες POS: οι μετρητές είναι μερικοί.');
 const visibleShifts=shifts.slice(0,250),attendance=sessions.slice(0,500),actions=posActions.slice(0,250),completed=attendance.filter(x=>x.status!=='OPEN');
 const minutes=key=>completed.reduce((sum,x)=>sum+n(x[key]),0);
 return {employee:{id:employee.id,fullName:employee.fullName},period,warnings,
  attendance:{sessions:attendance.length,completed:completed.length,workedMinutes:minutes('workedMinutes'),overtimeMinutes:minutes('overtimeMinutes'),lateMinutes:minutes('lateMinutes'),earlyLeaveMinutes:minutes('earlyLeaveMinutes'),needsReview:attendance.filter(x=>['NEEDS_REVIEW','NEEDS_APPROVAL'].includes(x.status)).length},
  cashier:{linked:operatorIds.length>0,operatorIds,...summarizeMonthlyShifts(visibleShifts),recentShifts:visibleShifts.map(x=>({...x,cashSales:money(x.cashSales),cardSales:money(x.cardSales),variance:x.closedInPeriod?money(x.variance):null,cardVariance:x.closedInPeriod?money(x.cardVariance):null,transactionCount:n(x.transactionCount),reversedCount:n(x.reversedCount)}))},
  posActions:{total:actions.length,cancellations:actions.filter(x=>x.actionType==='CANCEL').length,returns:actions.filter(x=>x.actionType==='RETURN').length,delayed:actions.filter(x=>x.actionType==='DELAYED').length,discounts:actions.filter(x=>String(x.actionType).includes('DISCOUNT')).length,items:actions},
  evaluations:{status:'EVIDENCE_FIRST',message:'Η αξιολόγηση παραμένει ανθρώπινη. Δεν υπολογίζεται αυτόματο score.'},recentAudit:[]};
}
