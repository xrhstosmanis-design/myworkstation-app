import {prisma} from "../prisma.js";
import {assertCustomerDemoOutboundAllowed} from "../customer-demo-runtime.js";
import {inboxHeader,selectedInboxRow,verifiedInboxPdf} from "../lib/pos-inbox-original.js";

export function createPosInboxHandler({database=prisma,readPdf=verifiedInboxPdf,allowOutbound=assertCustomerDemoOutboundAllowed}={}){
  return async(req,res,next)=>{try{
    const user=req.user||{},storeId=String(req.body?.storeId||""),taxId=String(req.body?.taxId||"").trim(),employee=user.tokenType==="STORE_OPERATOR"||user.role==="EMPLOYEE";
    if(!storeId||!/^\d{9}$/.test(taxId))return res.status(400).json({error:"Επίλεξε κατάστημα και γράψε ΑΦΜ 9 ψηφίων."});
    if(employee&&(!user.permissions?.includes("SUPPLIER_PAYMENT")||String(user.storeId||"")!==storeId)||!employee&&!["SUPER_ADMIN","OWNER","ADMIN","MANAGER","BACKOFFICE_USER"].includes(user.role))return res.status(403).json({error:"Δεν έχεις δικαίωμα αναζήτησης τιμολογίου σε αυτό το κατάστημα."});
    const store=await database.store.findFirst({where:{id:storeId,companyId:user.companyId,active:true},select:{id:true,companyId:true,company:{select:{taxId:true}}}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το επιλεγμένο κατάστημα."});
    const recipientVat=String(store.company.taxId||"").replace(/^EL/i,"").trim();
    res.set("Cache-Control","no-store");
    if(req.body?.inboxId){
      const row=await selectedInboxRow(database,user.companyId,storeId,String(req.body.inboxId));
      if(row.issuerVat!==taxId)return res.status(409).json({error:"Το τιμολόγιο δεν ανήκει στον επιλεγμένο προμηθευτή."});
      const header=inboxHeader(row,recipientVat);
      if(row.attachmentId&&row.mimeType!=="application/pdf")return res.status(409).json({error:"Δεν υπάρχει πρωτότυπο PDF. Χρησιμοποίησε φωτογραφίες."});
      if(!row.contentData)allowOutbound(store);
      const pdf=await readPdf(row,row.contentData);
      return res.json({header,filename:pdf.filename,mimeType:"application/pdf",dataUrl:`data:application/pdf;base64,${pdf.bytes.toString("base64")}`,pageCount:pdf.pageCount,inboxId:row.inboxId,requiresHumanReview:true});
    }
    const number=String(req.body.number||"").trim().slice(0,80),date=String(req.body.date||"");
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))return res.status(400).json({error:"Μη έγκυρη ημερομηνία."});
    const rows=await database.$queryRaw`SELECT m."inboxId",m."mark",m."issuerVat",m."counterpartVat",m."series",m."documentNumber",m."issueDate",m."invoiceType",m."currency",m."totalGross",i."receivedAt",i."attachmentId"
      FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
      WHERE m."companyId"=${user.companyId} AND m."storeId"=${storeId} AND m."issuerVat"=${taxId} AND m."counterpartVat"=${recipientVat}
        AND i."status" IN ('RECEIVED','IN_REVIEW')
        AND (${number}='' OR CONCAT_WS(' ',m."series",m."documentNumber") ILIKE ${"%"+number+"%"})
        AND (${date}='' OR m."issueDate"=${date||null}::date)
      ORDER BY m."issueDate" DESC,m."fetchedAt" DESC,m."id" DESC LIMIT 51`;
    const items=[];for(const row of rows.slice(0,50)){try{items.push({inboxId:row.inboxId,receivedAt:row.receivedAt,header:inboxHeader(row,recipientVat)})}catch{}}
    res.json({items,more:rows.length>50,message:items.length?"Επίλεξε το σωστό τιμολόγιο. Δεν γίνεται πληρωμή με την αναζήτηση.":"Δεν βρέθηκε διαθέσιμο τιμολόγιο στη θυρίδα. Χρησιμοποίησε φωτογραφίες."});
  }catch(error){next(error)}};
}
