import crypto from "crypto";
import {Router} from "express";
import * as XLSX from "xlsx";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import platformBulkCatalogRoutes from "./platform-bulk-catalog.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});
router.use("/bulk",platformBulkCatalogRoutes);

const uploadSchema=z.object({filename:z.string().trim().min(1).max(255),base64:z.string().min(100)});
const expectedHeaders=[
  "Εσωτερικός Κωδικός","Barcode","Περιγραφή","Κατηγορία","Υποκατηγορία","Προμηθευτής",
  "Εταιρεία / Brand","Τιμή Λιανικής","Τιμή Κόστους","ΦΠΑ","Απόθεμα","Ελάχιστο Απόθεμα",
  "Θέση Ραφιού","Ενεργό","Κατάσταση Ελέγχου"
];
const text=value=>value===undefined||value===null?null:String(value).trim();
const number=value=>{
  if(value===undefined||value===null||value==="")return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const isSummaryRow=row=>!text(row["Εσωτερικός Κωδικός"])&&/^\d+[.,]?\d*$/.test(text(row["Περιγραφή"])||"");

router.post("/preview",async(req,res,next)=>{
  try{
    const body=uploadSchema.parse(req.body||{});
    const buffer=Buffer.from(body.base64,"base64");
    if(buffer.length>8*1024*1024)return res.status(413).json({error:"Το αρχείο είναι μεγαλύτερο από το επιτρεπόμενο όριο των 8 MB."});

    const workbook=XLSX.read(buffer,{type:"buffer",cellDates:false,dense:true});
    const productSheet=workbook.Sheets["ΠΡΟΪΟΝΤΑ_IMPORT"];
    if(!productSheet)return res.status(400).json({error:"Δεν βρέθηκε το φύλλο ΠΡΟΪΟΝΤΑ_IMPORT."});

    const headerRows=XLSX.utils.sheet_to_json(productSheet,{header:1,range:0,blankrows:false,defval:null});
    const headers=(headerRows[0]||[]).map(v=>String(v||"").trim());
    for(const header of expectedHeaders){
      if(!headers.includes(header))return res.status(400).json({error:`Λείπει η στήλη «${header}».`});
    }

    const rows=XLSX.utils.sheet_to_json(productSheet,{defval:null,raw:true});
    const barcodeCount=new Map();
    const duplicateCandidates=new Map();
    let actualProducts=0;
    let missingBarcodes=0;
    let missingRetail=0;
    let placeholderCategories=0;
    let placeholderSubcategories=0;
    let vatUnverified=0;

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(isSummaryRow(row))continue;
      const sourceCode=text(row["Εσωτερικός Κωδικός"]);
      const name=text(row["Περιγραφή"]);
      if(!sourceCode||!name)continue;
      actualProducts++;

      const barcode=text(row["Barcode"]);
      const retail=number(row["Τιμή Λιανικής"]);
      const cost=number(row["Τιμή Κόστους"]);
      const vat=number(row["ΦΠΑ"]);
      const category=text(row["Κατηγορία"]);
      const subcategory=text(row["Υποκατηγορία"]);

      if(!barcode)missingBarcodes++;
      else{
        barcodeCount.set(barcode,(barcodeCount.get(barcode)||0)+1);
        const list=duplicateCandidates.get(barcode)||[];
        list.push({sourceCode,name,retail:retail!==null&&retail>0?retail:null,cost:cost!==null&&cost>0?cost:null,sourceRow:i+2});
        duplicateCandidates.set(barcode,list);
      }
      if(!(retail!==null&&retail>0))missingRetail++;
      if((category||"").startsWith("_ΧΩΡΙΣ"))placeholderCategories++;
      if((subcategory||"").startsWith("_ΧΩΡΙΣ"))placeholderSubcategories++;
      if(!(vat!==null&&vat>0))vatUnverified++;
    }

    const duplicateDetails=[];
    for(const [barcode,count] of barcodeCount.entries()){
      if(count>1)duplicateDetails.push({barcode,products:duplicateCandidates.get(barcode)||[]});
    }

    let declaredTotal=null;
    const reportSheet=workbook.Sheets["ΑΝΑΦΟΡΑ"];
    if(reportSheet){
      const reportRows=XLSX.utils.sheet_to_json(reportSheet,{header:1,defval:null});
      const totalRow=reportRows.find(item=>String(item?.[0]||"").trim()==="Σύνολο προϊόντων");
      if(totalRow&&Number.isFinite(Number(totalRow[1])))declaredTotal=Number(totalRow[1]);
    }

    const importVersion=crypto.createHash("sha256").update(buffer).digest("hex");
    const existing=await prisma.$queryRaw`SELECT "status","importedProducts","completedAt" FROM "MasterCatalogImport" WHERE "importVersion"=${importVersion} LIMIT 1`;

    res.json({
      filename:body.filename,
      importVersion,
      declaredTotal,
      actualProducts,
      duplicateBarcodes:duplicateDetails.length,
      missingBarcodes,
      missingRetail,
      placeholderCategories,
      placeholderSubcategories,
      vatUnverified,
      countDifference:declaredTotal===null?null:declaredTotal-actualProducts,
      duplicateDetails,
      alreadyImported:existing[0]?.status==="COMPLETED",
      existingImport:existing[0]||null,
      safety:{duplicateBarcodeScanDisabled:true,zeroRetailBecomesNull:true,zeroVatBecomesUnverified:true,stockNotImportedIntoStores:true}
    });
  }catch(error){next(error)}
});

export default router;
