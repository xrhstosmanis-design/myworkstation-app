import crypto from "crypto";
import {Router} from "express";
import * as XLSX from "xlsx";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const uploadSchema=z.object({filename:z.string().trim().min(1).max(255),base64:z.string().min(100)});
const text=value=>value===undefined||value===null?null:String(value).trim();
const number=value=>{if(value===undefined||value===null||value==="")return null;const normalized=typeof value==="string"?value.trim().replace(",","."):value;const parsed=Number(normalized);return Number.isFinite(parsed)?parsed:null};
const stableId=(prefix,value)=>`${prefix}_${crypto.createHash("sha1").update(String(value)).digest("hex")}`;

const aliases={
  sourceCode:["Εσωτερικός Κωδικός","SKU","Κωδικός","ΚΩΔΙΚΟΣ"],
  barcode:["Barcode","BARCODE","EAN"],
  name:["Περιγραφή","ΠΕΡΙΓΡΑΦΗ","Description"],
  category:["Κατηγορία","ΚΑΤΗΓΟΡΙΑ"],
  subcategory:["Υποκατηγορία","ΥΠΟΚΑΤΗΓΟΡΙΑ"],
  supplier:["Προμηθευτής","ΠΡΟΜΗΘΕΥΤΗΣ"],
  brand:["Εταιρεία / Brand","Εταιρεία","Brand"],
  retail:["Τιμή Λιανικής","Λιανική","ΛΙΑΝΙΚΗ"],
  cost:["Τιμή Κόστους","Τιμή Αγοράς","Αγορά","ΤΙΜΗ ΑΓΟΡΑΣ"],
  vat:["ΦΠΑ","ΦΠΑ %","VAT"],
  stock:["Απόθεμα","Stock","STOCK"],
  active:["Ενεργό","ΕΝΕΡΓΟ","Active"],
  reviewStatus:["Κατάσταση Ελέγχου","ΚΑΤΑΣΤΑΣΗ ΕΛΕΓΧΟΥ"]
};

const normalized=value=>String(value??"").trim().toLocaleUpperCase("el-GR");
const headerMatches=(header,candidates)=>candidates.some(candidate=>normalized(header)===normalized(candidate));
const findHeader=(headers,candidates)=>headers.find(header=>headerMatches(header,candidates))||null;
const rowValue=(row,headers,candidates)=>{const header=findHeader(headers,candidates);return header?row[header]:null};
const isSummaryRow=(row,headers)=>{
  const sourceCode=text(rowValue(row,headers,aliases.sourceCode));
  const name=text(rowValue(row,headers,aliases.name));
  return !sourceCode&&/^\d+[.,]?\d*$/.test(name||"");
};

function resolveProductSheet(workbook){
  const preferred=["ΠΡΟΪΟΝΤΑ_IMPORT","Προϊόντα","ΠΡΟΪΟΝΤΑ","Products","PRODUCTS"];
  for(const wanted of preferred){
    const actual=workbook.SheetNames.find(name=>normalized(name)===normalized(wanted));
    if(actual)return {name:actual,sheet:workbook.Sheets[actual]};
  }
  for(const name of workbook.SheetNames){
    const sheet=workbook.Sheets[name];
    const headers=(XLSX.utils.sheet_to_json(sheet,{header:1,range:0,blankrows:false})[0]||[]).map(v=>String(v||"").trim());
    if(findHeader(headers,aliases.sourceCode)&&findHeader(headers,aliases.name))return {name,sheet};
  }
  throw new Error(`Δεν βρέθηκε φύλλο προϊόντων. Διαθέσιμα φύλλα: ${workbook.SheetNames.join(", ")||"κανένα"}.`);
}

function parseWorkbook(base64){
  const buffer=Buffer.from(base64,"base64");
  if(buffer.length>8*1024*1024)throw new Error("Το αρχείο είναι μεγαλύτερο από το επιτρεπόμενο όριο των 8 MB.");
  const workbook=XLSX.read(buffer,{type:"buffer",cellDates:false});
  const resolved=resolveProductSheet(workbook),sheet=resolved.sheet;
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:true});
  const headers=(XLSX.utils.sheet_to_json(sheet,{header:1,range:0,blankrows:false})[0]||[]).map(v=>String(v||"").trim());
  const required=[["εσωτερικός κωδικός / SKU",aliases.sourceCode],["περιγραφή",aliases.name]];
  for(const [label,candidates] of required)if(!findHeader(headers,candidates))throw new Error(`Λείπει η στήλη «${label}». Βρέθηκαν: ${headers.filter(Boolean).join(", ")}.`);
  const products=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(isSummaryRow(row,headers))continue;
    const sourceCode=text(rowValue(row,headers,aliases.sourceCode)),name=text(rowValue(row,headers,aliases.name));
    if(!sourceCode||!name)continue;
    const retail=number(rowValue(row,headers,aliases.retail)),cost=number(rowValue(row,headers,aliases.cost)),vat=number(rowValue(row,headers,aliases.vat)),category=text(rowValue(row,headers,aliases.category)),barcode=text(rowValue(row,headers,aliases.barcode));
    const activeRaw=(text(rowValue(row,headers,aliases.active))||"ΝΑΙ").toUpperCase();
    const active=!(["ΟΧΙ","NO","FALSE","0","ΑΝΕΝΕΡΓΟ"].includes(activeRaw));
    products.push({
      sourceCode,originalSourceCode:sourceCode,barcode,name,
      categoryName:category,
      subcategoryName:text(rowValue(row,headers,aliases.subcategory)),
      supplierName:text(rowValue(row,headers,aliases.supplier)),
      brandName:text(rowValue(row,headers,aliases.brand)),
      defaultRetailPrice:retail!==null&&retail>0?retail:null,
      defaultCostPrice:cost!==null&&cost>0?cost:null,
      vatRate:vat!==null&&vat>=0?vat:null,
      vatVerified:Boolean(vat!==null&&vat>=0),
      active,
      reviewStatus:text(rowValue(row,headers,aliases.reviewStatus)),
      sourceRow:i+2
    });
  }
  if(!products.length)throw new Error(`Το φύλλο «${resolved.name}» βρέθηκε αλλά δεν περιέχει έγκυρες γραμμές προϊόντων με SKU/κωδικό και Περιγραφή.`);

  const sourceCodeCount=new Map();
  for(const product of products)sourceCodeCount.set(product.originalSourceCode,(sourceCodeCount.get(product.originalSourceCode)||0)+1);
  const duplicateSourceCodeSet=new Set([...sourceCodeCount.entries()].filter(([,count])=>count>1).map(([sourceCode])=>sourceCode));
  for(const product of products){
    if(!duplicateSourceCodeSet.has(product.originalSourceCode))continue;
    const discriminator=product.barcode||`ROW${product.sourceRow}`;
    product.sourceCode=`${product.originalSourceCode}~${discriminator}`;
  }

  const barcodeCount=new Map();for(const product of products)if(product.barcode)barcodeCount.set(product.barcode,(barcodeCount.get(product.barcode)||0)+1);
  const duplicateSet=new Set([...barcodeCount.entries()].filter(([,count])=>count>1).map(([barcode])=>barcode));
  for(const product of products)product.duplicateBarcode=Boolean(product.barcode&&duplicateSet.has(product.barcode));
  const duplicateDetails=[...duplicateSet].map(barcode=>({barcode,products:products.filter(product=>product.barcode===barcode).map(product=>({sourceCode:product.sourceCode,originalSourceCode:product.originalSourceCode,name:product.name,retail:product.defaultRetailPrice,cost:product.defaultCostPrice,sourceRow:product.sourceRow}))}));
  return {buffer,products,duplicateDetails,sheetName:resolved.name,stats:{actualProducts:products.length,duplicateSourceCodes:duplicateSourceCodeSet.size,duplicateSourceCodeRows:products.filter(product=>duplicateSourceCodeSet.has(product.originalSourceCode)).length,duplicateBarcodes:duplicateSet.size,missingBarcodes:products.filter(product=>!product.barcode).length,missingRetail:products.filter(product=>product.defaultRetailPrice===null).length,placeholderCategories:products.filter(product=>(product.categoryName||"").startsWith("_ΧΩΡΙΣ")).length,placeholderSubcategories:products.filter(product=>(product.subcategoryName||"").startsWith("_ΧΩΡΙΣ")).length,vatUnverified:products.filter(product=>!product.vatVerified).length}};
}

async function declaredReportTotal(base64){try{const workbook=XLSX.read(Buffer.from(base64,"base64"),{type:"buffer"});const sheet=workbook.Sheets["ΑΝΑΦΟΡΑ"];if(!sheet)return null;const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null});const row=rows.find(item=>String(item?.[0]||"").trim()==="Σύνολο προϊόντων");return row?Number(row[1]):null}catch{return null}}

router.post("/preview",async(req,res,next)=>{try{const body=uploadSchema.parse(req.body||{});const parsed=parseWorkbook(body.base64);const importVersion=crypto.createHash("sha256").update(parsed.buffer).digest("hex");const declaredTotal=await declaredReportTotal(body.base64);const existing=await prisma.$queryRaw`SELECT "status","importedProducts","completedAt" FROM "MasterCatalogImport" WHERE "importVersion"=${importVersion} LIMIT 1`;res.json({filename:body.filename,sheetName:parsed.sheetName,importVersion,declaredTotal,...parsed.stats,countDifference:declaredTotal===null?null:declaredTotal-parsed.stats.actualProducts,duplicateDetails:parsed.duplicateDetails,alreadyImported:existing[0]?.status==="COMPLETED",existingImport:existing[0]||null,safety:{duplicateBarcodeScanDisabled:true,duplicateSourceCodesMadeUnique:true,zeroRetailBecomesNull:true,zeroVatIsValid:true,stockNotImportedIntoStores:true}})}catch(error){next(error)}});

function productTuple(product,importVersion){const productId=stableId("mp",product.sourceCode);return {productId,values:[productId,product.sourceCode,product.name,product.categoryName,product.subcategoryName,product.supplierName,product.brandName,product.defaultRetailPrice,product.defaultCostPrice,product.vatRate,product.vatVerified,product.active,product.reviewStatus,product.sourceRow,importVersion]}}

async function upsertProducts(products,importVersion){
  const batchSize=250;
  for(let offset=0;offset<products.length;offset+=batchSize){
    const batch=products.slice(offset,offset+batchSize).map(product=>productTuple(product,importVersion)),params=[],tuples=[];
    for(const item of batch){const placeholders=item.values.map(value=>{params.push(value);return `$${params.length}`});tuples.push(`(${placeholders.join(",")})`)}
    const sql=`INSERT INTO "MasterProduct" ("id","sourceCode","name","categoryName","subcategoryName","supplierName","brandName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified","active","reviewStatus","sourceRow","importVersion") VALUES ${tuples.join(",")} ON CONFLICT ("sourceCode") DO UPDATE SET "name"=EXCLUDED."name","categoryName"=EXCLUDED."categoryName","subcategoryName"=EXCLUDED."subcategoryName","supplierName"=EXCLUDED."supplierName","brandName"=EXCLUDED."brandName","defaultRetailPrice"=EXCLUDED."defaultRetailPrice","defaultCostPrice"=EXCLUDED."defaultCostPrice","vatRate"=EXCLUDED."vatRate","vatVerified"=EXCLUDED."vatVerified","active"=EXCLUDED."active","reviewStatus"=EXCLUDED."reviewStatus","sourceRow"=EXCLUDED."sourceRow","importVersion"=EXCLUDED."importVersion","updatedAt"=CURRENT_TIMESTAMP`;
    await prisma.$executeRawUnsafe(sql,...params);
    const sourcedIds=batch.map(item=>item.productId);await prisma.$executeRawUnsafe(`DELETE FROM "MasterProductBarcode" WHERE "masterProductId" = ANY($1::text[]) AND "sourceRow" IS NOT NULL`,sourcedIds);
    const barcodeRows=[];
    for(let index=0;index<batch.length;index++){const product=products[offset+index];if(!product.barcode)continue;const masterProductId=batch[index].productId;barcodeRows.push({id:stableId("mb",`${masterProductId}:${product.barcode}`),masterProductId,barcode:product.barcode,scanEnabled:!product.duplicateBarcode,duplicateBarcode:product.duplicateBarcode,sourceRow:product.sourceRow})}
    if(barcodeRows.length){const barcodeParams=[],barcodeTuples=[];for(const row of barcodeRows){const values=[row.id,row.masterProductId,row.barcode,row.scanEnabled,row.duplicateBarcode,row.sourceRow];const placeholders=values.map(value=>{barcodeParams.push(value);return `$${barcodeParams.length}`});barcodeTuples.push(`(${placeholders.join(",")})`)}await prisma.$executeRawUnsafe(`INSERT INTO "MasterProductBarcode" ("id","masterProductId","barcode","scanEnabled","duplicateBarcode","sourceRow") VALUES ${barcodeTuples.join(",")} ON CONFLICT ("masterProductId","barcode") DO UPDATE SET "scanEnabled"=EXCLUDED."scanEnabled","duplicateBarcode"=EXCLUDED."duplicateBarcode","sourceRow"=EXCLUDED."sourceRow"`,...barcodeParams)}
  }
}

router.post("/import",async(req,res,next)=>{let importId=null;try{const body=uploadSchema.parse(req.body||{});const parsed=parseWorkbook(body.base64);const importVersion=crypto.createHash("sha256").update(parsed.buffer).digest("hex");const existing=await prisma.$queryRaw`SELECT "id","status","importedProducts","completedAt" FROM "MasterCatalogImport" WHERE "importVersion"=${importVersion} LIMIT 1`;if(existing[0]?.status==="COMPLETED")return res.json({ok:true,alreadyImported:true,importVersion,...existing[0]});importId=existing[0]?.id||crypto.randomUUID();await prisma.$executeRaw`INSERT INTO "MasterCatalogImport" ("id","importVersion","filename","totalRows","duplicateBarcodes","missingBarcodes","missingRetail","placeholderCategories","vatUnverified","status","createdByUserId") VALUES (${importId},${importVersion},${body.filename},${parsed.stats.actualProducts},${parsed.stats.duplicateBarcodes},${parsed.stats.missingBarcodes},${parsed.stats.missingRetail},${parsed.stats.placeholderCategories},${parsed.stats.vatUnverified},'IMPORTING',${req.user.id}) ON CONFLICT ("importVersion") DO UPDATE SET "filename"=EXCLUDED."filename","totalRows"=EXCLUDED."totalRows","duplicateBarcodes"=EXCLUDED."duplicateBarcodes","missingBarcodes"=EXCLUDED."missingBarcodes","missingRetail"=EXCLUDED."missingRetail","placeholderCategories"=EXCLUDED."placeholderCategories","vatUnverified"=EXCLUDED."vatUnverified","status"='IMPORTING',"error"=NULL,"startedAt"=CURRENT_TIMESTAMP`;await upsertProducts(parsed.products,importVersion);await prisma.$executeRaw`UPDATE "MasterCatalogImport" SET "importedProducts"=${parsed.stats.actualProducts},"status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP WHERE "id"=${importId}`;res.json({ok:true,alreadyImported:false,importVersion,importedProducts:parsed.stats.actualProducts,...parsed.stats})}catch(error){console.error("Master Catalog import failed",error);if(importId){try{await prisma.$executeRaw`UPDATE "MasterCatalogImport" SET "status"='FAILED',"error"=${String(error.message||error).slice(0,1000)},"completedAt"=CURRENT_TIMESTAMP WHERE "id"=${importId}`}catch{}}res.status(500).json({error:"Η εισαγωγή Master Catalog απέτυχε.",detail:String(error?.message||error).slice(0,700),code:error?.code||null})}});

router.get("/status",async(req,res,next)=>{try{const [catalog,imports]=await Promise.all([prisma.$queryRaw`SELECT COUNT(*)::int AS products,COUNT(*) FILTER (WHERE "defaultRetailPrice" IS NULL)::int AS "missingRetail",COUNT(*) FILTER (WHERE "vatVerified"=false)::int AS "vatUnverified" FROM "MasterProduct"`,prisma.$queryRaw`SELECT "id","importVersion","filename","totalRows","importedProducts","duplicateBarcodes","missingBarcodes","missingRetail","placeholderCategories","vatUnverified","status","startedAt","completedAt","error" FROM "MasterCatalogImport" ORDER BY "startedAt" DESC LIMIT 10`]);res.json({catalog:catalog[0]||{products:0,missingRetail:0,vatUnverified:0},imports})}catch(error){next(error)}});

router.get("/search",async(req,res,next)=>{try{const q=String(req.query.q||"").trim();if(q.length<2)return res.json([]);const like=`%${q}%`;const rows=await prisma.$queryRaw`SELECT p."id",p."sourceCode",p."name",p."categoryName",p."subcategoryName",p."brandName",p."defaultRetailPrice",p."defaultCostPrice",p."vatRate",p."vatVerified",p."reviewStatus",b."barcode",b."scanEnabled",b."duplicateBarcode" FROM "MasterProduct" p LEFT JOIN "MasterProductBarcode" b ON b."masterProductId"=p."id" WHERE p."name" ILIKE ${like} OR p."sourceCode" ILIKE ${like} OR b."barcode" ILIKE ${like} ORDER BY p."name" LIMIT 100`;res.json(rows)}catch(error){next(error)}});

export default router;