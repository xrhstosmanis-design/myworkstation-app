import {Router} from "express";
import {issueKioskPreview,parseKioskPaymentFile} from "../lib/kiosk-payment-workbook.js";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStaffAction} from "../services/backoffice-staff-access.js";
import bankPaymentPreviewRoutes from "./owner-bank-payments-preview.js";

const router=Router();
router.use(bankPaymentPreviewRoutes);
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const schema=z.object({storeId:z.string().trim().min(1),filename:z.string().trim().min(1).max(180),dataBase64:z.string().min(20).max(11500000)});
router.post("/preview-kiosk",async(req,res,next)=>{try{if(req.user?.staffAccess!==true&&(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role)))return res.status(403).json({error:"Η προεπισκόπηση Kiosk επιτρέπεται μόνο σε εξουσιοδοτημένο BackOffice χρήστη."});const body=schema.parse(req.body||{});await requireStaffAction(prisma,req,body.storeId,"payments.import-kiosk");if(!/\.(xlsx|xls|csv)$/i.test(body.filename))return res.status(400).json({error:"Επίλεξε Excel (.xlsx/.xls) ή CSV."});const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const parsed=parseKioskPaymentFile(body.filename,body.dataBase64);const supplier=parsed.rows.filter(r=>r.type==="SUPPLIER_PAYMENT"),other=parsed.rows.filter(r=>r.type==="OTHER_EXPENSE"),sum=rows=>rows.reduce((s,r)=>s+r.amount,0),dates=parsed.rows.map(r=>new Date(r.occurredAt).getTime());await requireStaffAction(prisma,req,store.id,"payments.import-kiosk");res.json({ok:true,previewOnly:true,previewReceipt:issueKioskPreview({companyId:req.user.companyId,storeId:store.id,actorId:req.user.id},body),message:"Προεπισκόπηση μόνο — δεν αποθηκεύτηκε καμία κίνηση.",store,filename:body.filename,sheet:parsed.sheet,headerRow:parsed.headerRow+1,skipped:parsed.skipped,summary:{count:parsed.rows.length,total:sum(parsed.rows),supplierCount:supplier.length,supplierTotal:sum(supplier),otherCount:other.length,otherTotal:sum(other),dateFrom:new Date(Math.min(...dates)).toISOString(),dateTo:new Date(Math.max(...dates)).toISOString()},sample:parsed.rows.slice(0,12)})}catch(error){next(error)}});

export default router;
