const singleLine=value=>String(value??"").replace(/[\r\n]+/g," ").trim();

export function buildInvoiceStockExclusionEmail(notice){
  const store=singleLine(notice.storeName);
  const excluded=notice.excludedLines;
  const date=new Intl.DateTimeFormat("el-GR",{
    dateStyle:"short",timeStyle:"short",timeZone:"Europe/Athens",hourCycle:"h23"
  }).format(new Date(notice.postedAt));
  const order=singleLine(notice.invoiceNumber||notice.orderId);
  return {
    subject:`${store} | ${excluded.length} γραμμές τιμολογίου εκτός αποθήκης`,
    text:[
      `Κατάστημα: ${store}`,
      `Χρήστης: ${singleLine(notice.actorName)}`,
      `Τιμολόγιο: ${order}`,
      `Προμηθευτής: ${singleLine(notice.supplierName)}`,
      `Καταχώριση: ${date}`,
      `Γραμμές προς αποθήκη: ${notice.stockLineCount}`,
      `Γραμμές που εξαιρέθηκαν: ${excluded.length}`,
      "",
      ...excluded.map(line=>[
        singleLine(line.code),singleLine(line.description),
        `${line.quantity} ${singleLine(line.unit)}`.trim()
      ].filter(Boolean).join(" · ")),
      ...(notice.backofficeUrl?["",`BackOffice: ${notice.backofficeUrl}`]:[])
    ].join("\n")
  };
}

export async function resolveInvoiceStockExclusionRecipient(tx,companyId,storeId){
  const owners=await tx.$queryRaw`
    SELECT DISTINCT LOWER(TRIM(u."email")) AS "email"
    FROM "Store" s JOIN "Company" c ON c."id"=s."companyId"
    JOIN "User" u ON u."companyId"=c."id"
    WHERE s."id"=${storeId} AND c."id"=${companyId} AND s."active" AND c."active"
      AND u."role"::text='OWNER' AND NOT u."mustChangePassword" AND TRIM(u."email")<>''
    LIMIT 2`;
  return owners.length===1?owners[0].email:null;
}

export async function dispatchInvoiceStockExclusionEmail(db,{send,resolveRecipient=resolveInvoiceStockExclusionRecipient}){
  return db.$transaction(async tx=>{
    const [notice]=await tx.$queryRaw`
      SELECT * FROM "InvoiceStockExclusionEmail"
      WHERE "sentAt" IS NULL AND "nextAttemptAt"<=NOW()
      ORDER BY "nextAttemptAt","companyId","storeId","orderId","reopenVersion"
      FOR UPDATE SKIP LOCKED LIMIT 1`;
    if(!notice)return "idle";
    let accepted=false;
    try{
      const to=await resolveRecipient(tx,notice.companyId,notice.storeId);
      if(to){
        const result=await send({to,companyId:notice.companyId,storeId:notice.storeId,...buildInvoiceStockExclusionEmail(notice.payload)});
        accepted=Array.isArray(result?.accepted)&&result.accepted.some(email=>
          String(email).toLowerCase()===to.toLowerCase());
      }
    }catch{
      // Leave delivery pending after temporary recipient or transport errors.
    }
    const retryMinutes=Math.min(60,2**Math.min(notice.attempts,6));
    await tx.$executeRaw`
      UPDATE "InvoiceStockExclusionEmail"
      SET "attempts"="attempts"+1,
          "sentAt"=CASE WHEN ${accepted} THEN NOW() ELSE NULL END,
          "nextAttemptAt"=NOW()+${retryMinutes}::integer*INTERVAL '1 minute'
      WHERE "companyId"=${notice.companyId} AND "storeId"=${notice.storeId}
        AND "orderId"=${notice.orderId} AND "reopenVersion"=${notice.reopenVersion}`;
    return accepted?"accepted":"pending";
  },{timeout:50000});
}

export function createInvoiceStockExclusionEmailScheduler({db,work,send}){
  let timer,inflight=false;
  work.onStop(()=>clearInterval(timer));
  async function sweep(){
    if(inflight||work.stopping)return;
    inflight=true;
    try{
      const [schema]=await db.$queryRaw`SELECT to_regclass('"InvoiceStockExclusionEmail"') IS NOT NULL AS "ready"`;
      if(!schema?.ready)return;
      for(let i=0;i<10&&!work.stopping;i++){
        if(await dispatchInvoiceStockExclusionEmail(db,{send})==="idle")break;
      }
    }finally{inflight=false}
  }
  return {start(){
    if(timer||work.stopping)return;
    timer=setInterval(()=>{
      if(!work.stopping&&!inflight)work.track(sweep()).catch(()=>{
        console.error("Invoice stock exclusion email queue sweep failed.");
      });
    },60000);
    timer.unref();
  }};
}
