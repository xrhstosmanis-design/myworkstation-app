import crypto from "crypto";
import {Router} from "express";
import XLSX from "xlsx";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN"]);
const val=(row,names)=>{for(const name of names)if(row[name]!==undefined&&String(row[name]).trim()!=="")return row[name];return ""};
const txt=value=>String(value??"").trim();
const num=value=>{const normalized=String(value??"").replace(/\s/g,"").replace(",",".");const n=Number(normalized);return Number.isFinite(n)?n:null};
const yes=value=>["1","TRUE","YES","ΝΑΙ","NAI","Ν"].includes(txt(value).toUpperCase());

function requireAccess(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η εισαγωγή ειδών επιτρέπεται μόνο σε Super Admin, Ιδιοκτήτη ή Admin."});next()}
router.use(requireAccess);

function readWorkbook(dataUrl){
  const match=/^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||""));
  if(!match){const e=new Error("Δεν διαβάστηκε το αρχείο Excel/CSV.");e.status=400;throw e}
  const workbook=XLSX.read(Buffer.from(match[1],"base64"),{type:"buffer",cellDates:true});
  const sheet=workbook.Sheets[workbook.SheetNames[0]];return XLSX.utils.sheet_to_json(sheet,{defval:""});
}
function normalizeRows(raw){
  return raw.slice(0,2000).map((r,index)=>{
    const sku=txt(val(r,["SKU","Κωδικός","ΚΩΔΙΚΟΣ","Εσωτ. κωδικός","Εσωτερικός κωδικός","Code"]));
    const name=txt(val(r,["Περιγραφή","ΠΕΡΙΓΡΑΦΗ","Όνομα","ΟΝΟΜΑ","Name","Product"]));
    const barcode=txt(val(r,["Barcode","BARCODE","barcode","EAN"]));
    const categoryName=txt(val(r,["Κατηγορία","ΚΑΤΗΓΟΡΙΑ","Category"]));
    const salePrice=num(val(r,["Λιανική","Τιμή πώλησης","Πώληση","SalePrice","Retail"]));
    const costPrice=num(val(r,["Κόστος","Τιμή αγοράς","Αγορά","CostPrice","Cost"]));
    const vatRate=num(val(r,["ΦΠΑ","% ΦΠΑ","VAT","VatRate"]));
    const stock=num(val(r,["Απόθεμα","Stock","STOCK","Ποσότητα"]));
    const activeRaw=val(r,["Ενεργό","Active","ACTIVE"]);const active=activeRaw===""?true:yes(activeRaw);
    const errors=[];if(!name)errors.push("Λείπει περιγραφή");if(!sku&&!barcode)errors.push("Χρειάζεται SKU ή Barcode");if(salePrice!==null&&salePrice<0)errors.push("Μη έγκυρη λιανική");if(costPrice!==null&&costPrice<0)errors.push("Μη έγκυρο κόστος");if(vatRate!==null&&(vatRate<0||vatRate>100))errors.push("Μη έγκυρο ΦΠΑ");if(stock!==null&&stock<0)errors.push("Μη έγκυρο απόθεμα");
    return {row:index+2,sku,name,barcode,categoryName,salePrice,costPrice,vatRate,stock,active,errors};
  });
}
async function scopedStore(req,storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});if(!store){const e=new Error("Δεν βρέθηκε ενεργό κατάστημα.");e.status=404;throw e}return store}
async function classify(companyId,rows){
  for(const row of rows){
    if(row.errors.length){row.action="INVALID";continue}
    let existing=null;
    if(row.sku){const r=await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${row.sku} LIMIT 1`;existing=r[0]||null}
    if(!existing&&row.barcode){const r=await prisma.$queryRaw`SELECT p."id",p."name" FROM "Product" p JOIN "ProductBarcode" pb ON pb."productId"=p."id" WHERE p."companyId"=${companyId} AND pb."barcode"=${row.barcode} LIMIT 1`;existing=r[0]||null}
    row.productId=existing?.id||null;row.currentName=existing?.name||null;row.action=existing?"UPDATE":"CREATE";
  }
  return rows;
}

router.post("/import-preview",async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string().min(1),dataUrl:z.string().max(12000000)}).parse(req.body||{});await scopedStore(req,body.storeId);
    const raw=readWorkbook(body.dataUrl);if(!raw.length||raw.length>2000)return res.status(400).json({error:"Το αρχείο πρέπει να έχει 1 έως 2.000 γραμμές."});
    const rows=await classify(req.user.companyId,normalizeRows(raw));
    res.json({rows,summary:{total:rows.length,create:rows.filter(r=>r.action==="CREATE").length,update:rows.filter(r=>r.action==="UPDATE").length,invalid:rows.filter(r=>r.action==="INVALID").length}});
  }catch(error){next(error)}
});

router.post("/import",async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string().min(1),dataUrl:z.string().max(12000000),applyStock:z.boolean().default(false)}).parse(req.body||{});const store=await scopedStore(req,body.storeId);
    const raw=readWorkbook(body.dataUrl);if(!raw.length||raw.length>2000)return res.status(400).json({error:"Το αρχείο πρέπει να έχει 1 έως 2.000 γραμμές."});
    const rows=await classify(req.user.companyId,normalizeRows(raw));const invalid=rows.filter(r=>r.action==="INVALID");if(invalid.length)return res.status(409).json({error:`Υπάρχουν ${invalid.length} μη έγκυρες γραμμές. Διορθώστε το αρχείο και ξανακάντε preview.`});
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
