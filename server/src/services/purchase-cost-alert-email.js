const line=value=>String(value??"").replace(/[\x00-\x1f\x7f]/g," ").trim();

async function claim(db){
  return db.$transaction(async tx=>{
    const [event]=await tx.$queryRaw`
      SELECT a."id",a."companyId",a."storeId",a."details",s."name" AS "storeName"
      FROM "StoreOperatorAudit" a
      JOIN "Store" s ON s."id"=a."storeId" AND s."companyId"=a."companyId" AND s."active"
      JOIN "Company" c ON c."id"=a."companyId" AND c."active"
      WHERE a."eventType" IN ('PURCHASE_COST_INCREASED','SUPPLIER_DISCOUNT_REDUCED')
        AND a."details"->>'emailStatus'='PENDING'
      ORDER BY a."createdAt",a."id" LIMIT 1 FOR UPDATE OF a SKIP LOCKED`;
    if(!event)return null;
    const recipients=await tx.$queryRaw`
      SELECT DISTINCT lower(trim(u."email")) AS email FROM "User" u
      WHERE u."companyId"=${event.companyId} AND NOT u."mustChangePassword"
        AND trim(u."email")<>'' AND (
          u."role"::text='OWNER' OR EXISTS (
            SELECT 1 FROM "BackofficeStaffAccount" a JOIN "BackofficeStaffGrant" g
              ON g."userId"=a."userId" AND g."companyId"=a."companyId"
            WHERE a."userId"=u."id" AND a."companyId"=u."companyId" AND a."active"
              AND g."storeId"=${event.storeId} AND g."active" AND g."profile"='MANAGER'
          )
        ) ORDER BY email`;
    await tx.$executeRaw`
      UPDATE "StoreOperatorAudit"
      SET "details"="details"||jsonb_build_object(
        'emailStatus',${recipients.length?"ATTEMPTING":"RECIPIENT_UNAVAILABLE"}::text,
        'emailAttemptedAt',NOW())
      WHERE "id"=${event.id} AND "companyId"=${event.companyId} AND "storeId"=${event.storeId}`;
    return {...event,recipients:recipients.map(row=>row.email)};
  });
}

export async function dispatchPurchaseCostAlert(db,send){
  const event=await claim(db);
  if(!event)return false;
  if(!event.recipients.length)return true;
  const {id,companyId,storeId,storeName,details}=event;
  const subject=[storeName,details.productName,
    details.previousDiscount==null?"Αύξηση τιμής αγοράς":"Μείωση έκπτωσης προμηθευτή"].map(line).join(" · ").slice(0,250);
  const text=[line(details.description),details.supplierName&&"Προμηθευτής: "+line(details.supplierName),
    details.documentId&&"Καταχώριση αγοράς: "+line(details.documentId)].filter(Boolean).join("\n");
  const deliveries=[];
  for(const [index,to] of event.recipients.entries()){
    let status="UNKNOWN",messageId=null;
    try{
      const result=await send({companyId,storeId,to,subject,text});
      if(result?.accepted?.some(address=>String(address).toLowerCase()===to)){
        status="ACCEPTED";
        messageId=typeof result.messageId==="string"?result.messageId.slice(0,500):null;
      }
    }catch{
      // A transport error may be ambiguous after SMTP accepted the email.
    }
    deliveries.push({recipientIndex:index+1,status,messageId});
    await db.$executeRaw`
      UPDATE "StoreOperatorAudit" SET "details"="details"||jsonb_build_object('emailDeliveries',${JSON.stringify(deliveries)}::jsonb)
      WHERE "id"=${id} AND "companyId"=${companyId} AND "storeId"=${storeId}
        AND "details"->>'emailStatus'='ATTEMPTING'`;
  }
  const status=deliveries.every(row=>row.status==="ACCEPTED")?"ACCEPTED":"UNKNOWN";
  await db.$executeRaw`
    UPDATE "StoreOperatorAudit" SET "details"="details"||jsonb_build_object('emailStatus',${status}::text)
    WHERE "id"=${id} AND "companyId"=${companyId} AND "storeId"=${storeId}
      AND "details"->>'emailStatus'='ATTEMPTING'`;
  return true;
}

export function createPurchaseCostAlertScheduler({db,work,send}){
  let timer,inflight=false;
  work.onStop(()=>clearInterval(timer));
  async function sweep(){
    if(inflight||work.stopping)return;
    inflight=true;
    try{
      const [schema]=await db.$queryRaw`
        SELECT to_regclass('"StoreOperatorAudit"') IS NOT NULL
          AND to_regclass('"BackofficeStaffAccount"') IS NOT NULL
          AND to_regclass('"BackofficeStaffGrant"') IS NOT NULL AS ready`;
      if(!schema?.ready)return;
      for(let i=0;i<10&&!work.stopping;i++){
        if(!await dispatchPurchaseCostAlert(db,send))break;
      }
    }finally{inflight=false}
  }
  return {start(){
    if(timer||work.stopping)return;
    timer=setInterval(()=>{
      if(!work.stopping&&!inflight)work.track(sweep()).catch(()=>console.error("Purchase-cost alert sweep failed."));
    },60000);
    timer.unref();
  }};
}
