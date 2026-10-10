import crypto from "crypto";
import {Router} from "express";
import XLSX from "xlsx";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {importFullArchive} from "./inventory-archive-full-import.js";
import {ensureProductCompanySchema} from "./management-product-companies.js";
import {ensureVatDepartmentSchema} from "./management-vat-departments.js";
import {attachSourceWorkbook,validateSourceDepartments} from "./inventory-source-workbook.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN"]);
const MAX_IMPORT_ROWS=10000;
// Kiosk Manager Διαδόχου Παύλου: code -> displayed VAT percentage.
// Keep the source code separately; codes 12/14/45 all display 0% but
// represent different fiscal departments in the source system.
const SOURCE_VAT_RATES={"12":0,"14":0,"45":0,"21":6,"42":13,"15":24};
const SOURCE_DEPARTMENT_RATES={"5.ΕΙΔΗ 13":13,"ΕΙΔΗ 24":24,"1.ΚΑΠΝΙΚΑ":24,"3. ΚΑΡΤΕΣ ΚΙΝΗΤΗΣ":0,"04.ΕΙΔΗ 6":6,"7. ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΑΣ":24,"8.ΕΙΣΙΤΗΡΙΑ":0,"ΣΚΡΑΤΣ ΞΥΣΤΟ":0};
const val=(row,names)=>{for(const name of names)if(row[name]!==undefined&&String(row[name]).trim()!=="")return row[name];return ""};
const txt=value=>String(value??"").trim();
const num=value=>{const normalized=String(value??"").replace(/\s/g,"").replace(",",".");if(!normalized)return null;const n=Number(normalized);return Number.isFinite(n)?n:null};
const yes=value=>["1","TRUE","YES","ΝΑΙ","NAI","Ν"].includes(txt(value).toUpperCase());

function requireAccess(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η εισαγωγή ειδών επιτρέπεται μόνο σε Super Admin, Ιδιοκτήτη ή Admin."});next()}
router.use(requireAccess);

export function readWorkbook(dataUrl){
  const match=/^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||""));
  if(!match){const e=new Error("Δεν διαβάστηκε το αρχείο Excel/CSV.");e.status=400;throw e}
  const workbook=XLSX.read(Buffer.from(match[1],"base64"),{type:"buffer",cellDates:true});
  const sheet=workbook.Sheets[workbook.SheetNames[0]];return attachSourceWorkbook(workbook,XLSX.utils.sheet_to_json(sheet,{defval:""}),XLSX);
}
export function normalizeRows(raw){
  return raw.map((r,index)=>{
    const sku=txt(val(r,["SKU","Κωδικός","ΚΩΔΙΚΟΣ","Εσωτ. κωδικός","Εσωτερικός κωδικός","Code"]));
    const name=txt(val(r,["Περιγραφή είδους","Περιγραφή","ΠΕΡΙΓΡΑΦΗ","Όνομα","ΟΝΟΜΑ","Name","Product"]));
    const barcode=txt(val(r,["Barcode","BARCODE","barcode","EAN"]));
    const categoryName=txt(val(r,["Κατηγορία","ΚΑΤΗΓΟΡΙΑ","Category"]));
    const salePrice=num(val(r,["Πώληση (με ΦΠΑ)","Λιανική","Τιμή πώλησης","Πώληση","SalePrice","Retail"]));
    const costPrice=num(val(r,["Αγορά (προ ΦΠΑ)","Κόστος","Τιμή αγοράς","Αγορά","CostPrice","Cost"]));
    const sourceVatCode=txt(val(r,["ΚΩΔ. ΦΠΑ"]));
    const sourceDepartment=txt(val(r,["Τμήμα ΦΠΑ"]));
    const explicitVat=num(val(r,["ΦΠΑ","% ΦΠΑ","VAT","VatRate"]));
    const sourceDefinition=raw.sourceProfile?.departments.find(d=>d.description===sourceDepartment);
    const vatRate=raw.sourceProfile?(sourceDefinition?.vatRate??null):sourceVatCode&&Object.hasOwn(SOURCE_VAT_RATES,sourceVatCode)?SOURCE_VAT_RATES[sourceVatCode]:sourceDepartment&&Object.hasOwn(SOURCE_DEPARTMENT_RATES,sourceDepartment)?SOURCE_DEPARTMENT_RATES[sourceDepartment]:explicitVat;
    const stock=num(val(r,["Απόθεμα","Stock","STOCK","Ποσότητα"]));
    const activeRaw=val(r,["Ενεργό","Active","ACTIVE"]);const active=activeRaw===""?true:yes(activeRaw);
    const errors=[];if(!name)errors.push("Λείπει περιγραφή");if(!sku&&!barcode)errors.push("Χρειάζεται SKU ή Barcode");if(salePrice!==null&&salePrice<0)errors.push("Μη έγκυρη λιανική");if(costPrice!==null&&costPrice<0)errors.push("Μη έγκυρο κόστος");if(vatRate!==null&&(vatRate<0||vatRate>100))errors.push("Μη έγκυρο ΦΠΑ");if(stock!==null&&stock<0)errors.push("Μη έγκυρο απόθεμα");
    const supplierName=txt(val(r,["Βασικός Προμηθευτής","Προμηθευτής"]));
    const supplierCode=txt(val(r,["Κωδ. Τιμολογίου","Κωδικός προμηθευτή"]));
    const subcategoryName=txt(val(r,["Υποκατηγορία"]));
    const brandName=txt(val(r,["Εταιρεία"]));
    const staffPrice=num(val(r,["τιμή προσωπικού:"]));
    const minStock=num(val(r,["Alarm Stock"]));
    const discountA=num(val(r,["Εκπτ. Α"]));
    const discountB=num(val(r,["Εκπτ. Β"]));
    const discountC=num(val(r,["Εκπτ. Γ"]));
    if(raw.sourceProfile){
      if(!sourceDefinition)errors.push(`Άγνωστο τμήμα ΦΠΑ ${sourceDepartment}`);
      if(sourceDefinition&&Number(r["Τμήμα ταμειακής"])!==sourceDefinition.cashRegisterDepartment)errors.push("Το τμήμα ταμειακής διαφωνεί με την πηγή");
      if(sourceVatCode&&sourceVatCode!==sourceDefinition?.legacyVatCode)errors.push("Ο κωδικός ΦΠΑ διαφωνεί με το τμήμα της πηγής");
      if(explicitVat===null||explicitVat!==vatRate)errors.push("Λείπει ή διαφωνεί το ποσοστό ΦΠΑ της πηγής");
      if(stock!==0)errors.push("Η πρώτη εισαγωγή απαιτεί αρχικό απόθεμα 0");
      if(txt(r["Μονάδα Kiosk"])!=="TEM")errors.push("Μη υποστηριζόμενη μονάδα πηγής");
      if(salePrice===null||costPrice===null)errors.push("Λείπει τιμή πώλησης ή αγοράς της πηγής");
      if([salePrice,costPrice].some(price=>price!==null&&Math.abs(price-Math.round(price*10000)/10000)>1e-9))errors.push("Η τιμή πηγής απαιτεί περισσότερα από 4 δεκαδικά. Δεν επιτρέπεται στρογγυλοποίηση στην εισαγωγή.");
    }else{
      if(sourceVatCode&&!Object.hasOwn(SOURCE_VAT_RATES,sourceVatCode))errors.push(`Άγνωστος κωδικός ΦΠΑ ${sourceVatCode}`);
      if(sourceDepartment&&!Object.hasOwn(SOURCE_DEPARTMENT_RATES,sourceDepartment))errors.push(`Άγνωστο τμήμα ΦΠΑ ${sourceDepartment}`);
    }
    if(categoryName.toUpperCase().includes("ΤΥΠΟΣ")||sourceDepartment.toUpperCase().includes("ΤΥΠΟΣ"))errors.push("Ο Τύπος εξαιρείται από αυτή την εισαγωγή");
    if(sourceVatCode&&explicitVat!==null&&explicitVat!==vatRate)errors.push("Ο κωδικός ΦΠΑ διαφωνεί με το ποσοστό ΦΠΑ");
    if(sourceDepartment&&explicitVat!==null&&explicitVat!==vatRate)errors.push("Το τμήμα ΦΠΑ διαφωνεί με το ποσοστό ΦΠΑ");
    // The legacy importer below cannot persist these fields. Keep the final
    // import blocked until the full archive path has been wired and verified.
    if(!sourceDepartment&&(supplierName||supplierCode||subcategoryName||brandName||staffPrice!==null||minStock!==null||discountA!==null||discountB!==null||discountC!==null))errors.push("Εκκρεμεί πλήρης αντιστοίχιση στοιχείων καρτέλας είδους");
    if(sourceDepartment&&vatRate===null)errors.push("Λείπει αντιστοίχιση τμήματος ΦΠΑ");
    return {row:index+2,sku,name,barcode,barcodes:r.sourceBarcodes||[barcode].filter(Boolean),categoryName,subcategoryName,supplierName,supplierCode,brandName,staffPrice,minStock,discountA,discountB,discountC,salePrice,costPrice,vatRate,sourceVatCode,sourceDepartment,stock,active,errors};
  });
}
async function scopedStore(req,storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});if(!store){const e=new Error("Δεν βρέθηκε ενεργό κατάστημα.");e.status=404;throw e}return store}
export async function classify(companyId,rows,db=prisma){
  const skus=[...new Set(rows.map(row=>row.sku).filter(Boolean))];
  const barcodes=[...new Set(rows.flatMap(row=>row.barcodes||[row.barcode]).filter(Boolean))];
  const [products,barcodeProducts]=await Promise.all([
    skus.length?db.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=ANY(${skus}::text[])`:[],
    barcodes.length?db.$queryRaw`SELECT pb."barcode",p."id",p."sku",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${companyId} AND pb."barcode"=ANY(${barcodes}::text[])`:[]
  ]);
  const bySku=new Map(products.map(row=>[row.sku,row]));
  const byBarcode=new Map();for(const match of barcodeProducts){if(byBarcode.has(match.barcode)&&byBarcode.get(match.barcode)?.id!==match.id)byBarcode.set(match.barcode,null);else if(!byBarcode.has(match.barcode))byBarcode.set(match.barcode,match)}
  const seenSku=new Map(),seenBarcode=new Map();
  for(const row of rows){
    for(const [label,value,seen] of [["SKU",row.sku,seenSku],...(row.barcodes||[row.barcode]).map(value=>["barcode",value,seenBarcode])]){
      if(!value)continue;
      if(seen.has(value))row.errors.push(`Διπλό ${label} με τη γραμμή ${seen.get(value)}`);
      else seen.set(value,row.row);
    }
    if(row.errors.length){row.action="INVALID";continue}
    const matches=(row.barcodes||[row.barcode]).filter(Boolean).filter(b=>byBarcode.has(b)).map(b=>byBarcode.get(b));
    if(matches.some(m=>m===null)||new Set(matches.map(m=>m?.id)).size>1){row.errors.push("Τα barcode αντιστοιχούν σε περισσότερα από ένα υπάρχοντα είδη");row.action="INVALID";continue}
    const skuMatch=bySku.get(row.sku),barcodeMatch=matches[0];
    if(barcodeMatch?.sku&&row.sku&&barcodeMatch.sku!==row.sku){row.errors.push("Το υπάρχον barcode έχει διαφορετικό εσωτερικό κωδικό");row.action="INVALID";continue}
    if(skuMatch&&barcodeMatch&&skuMatch.id!==barcodeMatch.id){row.errors.push("Το SKU και το barcode αντιστοιχούν σε διαφορετικά είδη");row.action="INVALID";continue}
    const existing=skuMatch||barcodeMatch||null;
    row.productId=existing?.id||null;row.currentName=existing?.name||null;row.action=existing?"UPDATE":"CREATE";
  }
  return rows;
}

export async function prepareArchiveRows(db,companyId,raw){
  if(raw.sourceProfile){
    const departments=await db.$queryRaw`SELECT "id","description","vatRate","legacyVatCode","cashRegisterDepartment","commerce","active","exemptionCode","exemptionDescription" FROM "ManagementVatDepartment" WHERE "companyId"=${companyId}`;
    validateSourceDepartments(raw.sourceProfile,departments);
  }
  const rows=await classify(companyId,normalizeRows(raw),db);
  if(raw.sourceProfile)for(const row of rows){
    if(row.action==="UPDATE"){row.errors.push("Η πρώτη εισαγωγή δεν ενημερώνει υπάρχον SKU ή barcode. Απαιτείται ξεχωριστός έλεγχος.");row.action="INVALID";}
  }
  return rows;
}

router.post("/import-preview",async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string().min(1),dataUrl:z.string().max(12000000)}).parse(req.body||{});await scopedStore(req,body.storeId);
    const raw=readWorkbook(body.dataUrl);if(!raw.length||raw.length>MAX_IMPORT_ROWS)return res.status(400).json({error:`Το αρχείο πρέπει να έχει 1 έως ${MAX_IMPORT_ROWS.toLocaleString("el-GR")} γραμμές.`});
    const rows=await prepareArchiveRows(prisma,req.user.companyId,raw);
    res.json({rows,summary:{total:rows.length,create:rows.filter(r=>r.action==="CREATE").length,update:rows.filter(r=>r.action==="UPDATE").length,invalid:rows.filter(r=>r.action==="INVALID").length,barcodes:rows.reduce((n,r)=>n+r.barcodes.length,0),sourceProfile:raw.sourceProfile?.name||null}});
  }catch(error){next(error)}
});

router.post("/import",async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string().min(1),dataUrl:z.string().max(12000000),applyStock:z.boolean().default(false)}).parse(req.body||{});const store=await scopedStore(req,body.storeId);
    const raw=readWorkbook(body.dataUrl);if(!raw.length||raw.length>MAX_IMPORT_ROWS)return res.status(400).json({error:`Το αρχείο πρέπει να έχει 1 έως ${MAX_IMPORT_ROWS.toLocaleString("el-GR")} γραμμές.`});
    const rows=await prepareArchiveRows(prisma,req.user.companyId,raw);const invalid=rows.filter(r=>r.action==="INVALID");if(invalid.length)return res.status(409).json({error:`Υπάρχουν ${invalid.length} μη έγκυρες γραμμές. Διορθώστε το αρχείο και ξανακάντε preview.`});
    if(raw[0]&&Object.hasOwn(raw[0],"Τμήμα ΦΠΑ")){
      if(body.applyStock)return res.status(400).json({error:"Η πλήρης εισαγωγή δεν ενημερώνει απόθεμα υπαρχόντων ειδών."});
      if(rows.some(row=>!row.sourceDepartment))return res.status(400).json({error:"Λείπει τμήμα ΦΠΑ από γραμμή του αρχείου."});
      await ensureProductCompanySchema();await ensureVatDepartmentSchema();
      const result=await prisma.$transaction(async tx=>{
        if(!raw.sourceProfile)return importFullArchive(tx,req.user.companyId,store.id,rows);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.companyId+":product-sku"}))`;
        const barcodes=[...new Set(rows.flatMap(row=>row.barcodes))].sort();
        if(barcodes.length)await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1||':barcode:'||barcode)) FROM (SELECT unnest($2::text[]) AS barcode ORDER BY barcode) b`,req.user.companyId,barcodes);
        // Older barcode writers do not all take advisory locks. Hold a short
        // write lock through final collision readback and insertion; POS reads
        // remain available, and no other company's data is modified.
        await tx.$executeRawUnsafe('LOCK TABLE "ProductBarcode" IN SHARE ROW EXCLUSIVE MODE');
        const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${store.id} AND "companyId"=${req.user.companyId} AND "active"=true FOR SHARE`;
        if(!stores.length){const error=new Error("Το κατάστημα άλλαξε. Κάντε νέα προεπισκόπηση.");error.status=409;throw error}
        const fresh=await prepareArchiveRows(tx,req.user.companyId,raw);
        if(fresh.some(row=>row.action!=="CREATE")){const error=new Error("Άλλαξε η αντιστοίχιση SKU ή barcode. Δεν εισήχθη κανένα είδος. Κάντε νέα προεπισκόπηση.");error.status=409;throw error}
        return importFullArchive(tx,req.user.companyId,store.id,fresh,{sourceProfile:raw.sourceProfile});
      },{maxWait:10000,timeout:300000});
      return res.status(201).json({ok:true,...result,applyStock:false});
    }
    let created=0,updated=0;
    await prisma.$transaction(async tx=>{
      for(const row of rows){
        let categoryId=null;if(row.categoryName){const c=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} AND "name"=${row.categoryName} LIMIT 1`;categoryId=c[0]?.id||uid();if(!c[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${req.user.companyId},${row.categoryName})`}
        if(row.action==="CREATE"){
          const productId=uid();await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${req.user.companyId},${categoryId},${row.sku||null},${row.name},'PIECE',${row.vatRate??0},${row.vatRate!==null},${row.salePrice??0},${row.costPrice??0},true,${row.active})`;
          if(row.barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${row.barcode},1)`;
          await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${productId},${row.salePrice??0},${row.stock??0},${row.active}) ON CONFLICT ("storeId","productId") DO NOTHING`;created++;
        }else{
          const p=row.productId;await tx.$executeRaw`UPDATE "Product" SET "name"=${row.name},"categoryId"=COALESCE(${categoryId},"categoryId"),"salePrice"=COALESCE(${row.salePrice},"salePrice"),"costPrice"=COALESCE(${row.costPrice},"costPrice"),"vatRate"=COALESCE(${row.vatRate},"vatRate"),"vatVerified"=CASE WHEN ${row.vatRate}::numeric IS NULL THEN "vatVerified" ELSE TRUE END,"active"=${row.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${p} AND "companyId"=${req.user.companyId}`;
          await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${p},${row.salePrice??0},${body.applyStock?(row.stock??0):0},${row.active}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=COALESCE(${row.salePrice},"StoreProduct"."salePrice"),"currentStock"=CASE WHEN ${body.applyStock} THEN COALESCE(${row.stock},"StoreProduct"."currentStock") ELSE "StoreProduct"."currentStock" END,"active"=${row.active},"updatedAt"=CURRENT_TIMESTAMP`;updated++;
        }
      }
    });
    res.status(201).json({ok:true,created,updated,applyStock:body.applyStock});
  }catch(error){next(error)}
});

export default router;
