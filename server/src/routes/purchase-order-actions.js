import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireStaffGrant,staffError} from "../services/backoffice-staff-access.js";
import {sendEmail} from "../services/mail.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const eur=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
router.post("/:orderId/email",async(req,res,next)=>{try{
  const delegated=req.user?.staffAccess===true;
  if(!delegated&&!req.posPurchaseOrderAccess&&(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role)))return res.status(403).json({error:"Δεν έχεις δικαίωμα αποστολής παραγγελίας."});
  if(delegated){
    if(req.staffGrant?.capability!=="invoices.email"||!req.user.storeId)throw staffError();
    if(req.body?.confirmed!==true||Object.keys(req.body).some(key=>key!=="confirmed"))
      throw staffError(400,"STAFF_INVOICE_EMAIL_CONFIRM","Επιβεβαίωσε την αποστολή στο καταχωρημένο email του προμηθευτή.");
  }

  const rows=await prisma.$queryRaw`SELECT o."id",o."storeId",o."invoiceNumber",o."status",o."description",o."createdAt",s."name" AS "supplierName",s."email" AS "supplierEmail",st."name" AS "storeName" FROM "PurchaseOrder" o JOIN "Store" st ON st."id"=o."storeId" AND st."companyId"=o."companyId" LEFT JOIN "Supplier" s ON s."id"=o."supplierId" AND s."companyId"=o."companyId" WHERE o."id"=${req.params.orderId} AND o."companyId"=${req.user.companyId} AND (${!delegated} OR o."storeId"=${req.user.storeId??null}) LIMIT 1`;
  const order=rows[0];if(!order)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});if(!order.supplierEmail)return res.status(422).json({error:"Ο προμηθευτής δεν έχει καταχωρημένο email."});
  const lines=await prisma.$queryRaw`SELECT "description","supplierCode","quantity","unitCost","discount1","discount2","discount3","vatRate","netAmount","grossAmount" FROM "PurchaseOrderLine" WHERE "orderId"=${order.id} ORDER BY "createdAt"`;
  if(!lines.length)return res.status(409).json({error:"Η παραγγελία δεν έχει είδη για αποστολή."});
  const total=lines.reduce((sum,row)=>sum+Number(row.grossAmount||0),0);const subject=`Παραγγελία ${order.invoiceNumber||String(order.id).slice(0,8)} · ${order.storeName}`;
  const text=[subject,`Προμηθευτής: ${order.supplierName||"—"}`,`Κατάστημα: ${order.storeName}`,"",...lines.map((row,index)=>`${index+1}. ${row.description} · ${Number(row.quantity)} × ${eur(row.unitCost)} · ${eur(row.grossAmount)}`),"",`Σύνολο με ΦΠΑ: ${eur(total)}`].join("\n");
  const htmlRows=lines.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.supplierCode||"—")}</td><td>${esc(row.description)}</td><td>${Number(row.quantity)}</td><td>${eur(row.unitCost)}</td><td>${Number(row.vatRate)}%</td><td><b>${eur(row.grossAmount)}</b></td></tr>`).join("");
  const html=`<div style="font-family:Arial,sans-serif;max-width:900px"><h2>${esc(subject)}</h2><p><b>Προμηθευτής:</b> ${esc(order.supplierName||"—")} · <b>Κατάστημα:</b> ${esc(order.storeName)}</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="7"><thead><tr><th>#</th><th>Κωδικός</th><th>Είδος</th><th>Ποσ.</th><th>Τιμή μον.</th><th>ΦΠΑ</th><th>Σύνολο</th></tr></thead><tbody>${htmlRows}</tbody></table><h3>Σύνολο με ΦΠΑ: ${eur(total)}</h3><p style="color:#64748b">Αποστολή από MyWorkStation.</p></div>`;
  if(delegated)await requireStaffGrant(prisma,req.user,order.storeId,"invoices.email");
  const sent=await sendEmail({companyId:req.user.companyId,storeId:order.storeId,to:order.supplierEmail,subject,text,html});res.json({ok:true,recipient:order.supplierEmail,messageId:sent.messageId});
}catch(error){next(error)}});

export default router;
