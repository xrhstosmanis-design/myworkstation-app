import crypto from "crypto";
import {Router} from "express";
import * as XLSX from "xlsx";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const allowedRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const bodySchema=z.object({
  storeId:z.string().trim().min(1),
  filename:z.string().trim().min(1).max(180),
  dataBase64:z.string().min(20).max(11500000)
});

let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreTransaction" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "sessionId" TEXT,
        "type" TEXT NOT NULL,
        "amount" NUMERIC(14,2) NOT NULL,
        "description" TEXT,
        "supplierId" TEXT,
        "supplierName" TEXT,
        "attachmentData" TEXT,
        "attachmentMimeType" TEXT,
        "attachmentFilename" TEXT,
        "attachmentChecksum" TEXT,
        "subtractFromShift" BOOLEAN NOT NULL DEFAULT false,
        "actorId" TEXT NOT NULL,
        "actorName" TEXT NOT NULL,
        "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "reversedAt" TIMESTAMPTZ,
        "reversedBy" TEXT,
        "reversedByName" TEXT,
        "reversalReason" TEXT
      )`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceHash" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMPTZ`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StoreTransaction_kiosk_import_hash_key" ON "StoreTransaction" ("companyId","storeId","sourceType","sourceHash") WHERE "sourceHash" IS NOT NULL`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

const strip=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9α-ω]/g,"");
const money=value=>{
  if(value===null||value===undefined||value==="")return 0;
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  let raw=String(value).trim().replace(/\s/g,"").replace(/€/g,"");
  if(raw.includes(",")){raw=raw.replace(/\./g,"").replace(",",".")}
  else raw=raw.replace(/[^0-9.-]/g,"");
  const n=Number(raw);return Number.isFinite(n)?Math.abs(n):0;
};
function dateValue(value){
  if(value instanceof Date&&Number.isFinite(value.getTime()))return value;
  if(typeof value==="number"&&Number.isFinite(value)){
    const parsed=XLSX.SSF.parse_date_code(value);
    if(parsed)return new Date(parsed.y,parsed.m-1,parsed.d,parsed.H||0,parsed.M||0,Math.floor(parsed.S||0));
  }
  const text=String(value??"").trim();
  const m=text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if(m){const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12,0,0);if(Number.isFinite(d.getTime()))return d}
  const direct=new Date(text);return Number.isFinite(direct.getTime())?direct:null;
}
const aliases={
  date:["ημερομηνια","date"],
  expense:["πληρωμεςεξοδων","εξοδαπροστριτους","εξοδα"],
  supplierAmount:["πληρωμεςπρομηθευτων","πληρωμηπρομηθευτη"],
  amount:["ποσο","ποσοπληρωμης","πληρωμη","συνολο"],
  supplier:["προμηθευτης","supplier"],
  description:["περιγραφη","παρατηρησεις","αιτιολογια","κατηγοριαεξοδου"],
  document:["παραστατικο","αρπαραστατικου","τιμολογιο","document"],
  type:["τυπος","ειδος","κατηγορια"]
};
function col(headers,names){
  const normalized=headers.map(strip);
  for(const alias of names){const exact=normalized.findIndex(h=>h===alias);if(exact>=0)return exact}
  for(const alias of names){const fuzzy=normalized.findIndex(h=>h.includes(alias));if(fuzzy>=0)return fuzzy}
  return -1;
}
function findHeader(matrix){
  let best={row:-1,score:-1};
  for(let r=0;r<Math.min(matrix.length,35);r++){
    const h=(matrix[r]||[]).map(strip);
    const score=Object.values(aliases).filter(group=>group.some(alias=>h.some(cell=>cell===alias||cell.includes(alias)))).length;
    if(score>best.score)best={row:r,score};
  }
  return best.score>=2?best.row:-1;
}
function normalizeRows(matrix,headerRow){
  const headers=matrix[headerRow]||[];
  const idx={date:col(headers,aliases.date),expense:col(headers,aliases.expense),supplierAmount:col(headers,aliases.supplierAmount),amount:col(headers,aliases.amount),supplier:col(headers,aliases.supplier),description:col(headers,aliases.description),document:col(headers,aliases.document),type:col(headers,aliases.type)};
  if(idx.date<0||Math.max(idx.expense,idx.supplierAmount,idx.amount)<0)throw Object.assign(new Error("Δεν βρέθηκαν οι απαραίτητες στήλες Ημερομηνία και Ποσό/Πληρωμές στο αρχείο Kiosk."),{status:400});
  const rows=[];let skipped=0;
  for(const raw of matrix.slice(headerRow+1)){
    const occurredAt=dateValue(raw[idx.date]);
    const supplierAmount=idx.supplierAmount>=0?money(raw[idx.supplierAmount]):0;
    const expenseAmount=idx.expense>=0?money(raw[idx.expense]):0;
    const genericAmount=idx.amount>=0?money(raw[idx.amount]):0;
    const supplierName=idx.supplier>=0?String(raw[idx.supplier]??"").trim():"";
    const description=idx.description>=0?String(raw[idx.description]??"").trim():"";
    const sourceRef=idx.document>=0?String(raw[idx.document]??"").trim():"";
    const typeText=idx.type>=0?strip(raw[idx.type]):"";
    let type="OTHER_EXPENSE",amount=expenseAmount||genericAmount;
    if(supplierAmount>0){type="SUPPLIER_PAYMENT";amount=supplierAmount}
    else if(typeText.includes("προμηθευ")||(!expenseAmount&&supplierName)){type="SUPPLIER_PAYMENT"}
    if(!occurredAt||!amount||amount<=0){skipped++;continue}
    const effectiveSupplier=type==="SUPPLIER_PAYMENT"?(supplierName||description):supplierName;
    const effectiveDescription=description||effectiveSupplier||"Εισαγωγή Kiosk Manager";
    rows.push({occurredAt,type,amount,supplierName:effectiveSupplier,description:`Kiosk · ${effectiveDescription}`,sourceRef});
  }
  return {rows,skipped,columns:idx};
}

router.post("/import-kiosk",async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"||!allowedRoles.has(req.user?.role))return res.status(403).json({error:"Η εισαγωγή Kiosk επιτρέπεται μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
    const body=bodySchema.parse(req.body||{});
    if(!/\.(xlsx|xls|csv)$/i.test(body.filename))return res.status(400).json({error:"Επίλεξε αρχείο Excel (.xlsx/.xls) ή CSV."});
    const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το επιλεγμένο κατάστημα."});
    const bytes=Buffer.from(body.dataBase64,"base64");
    if(bytes.length<20||bytes.length>8*1024*1024)return res.status(400).json({error:"Το αρχείο πρέπει να είναι έως 8 MB."});
    let workbook;
    try{workbook=XLSX.read(bytes,{type:"buffer",cellDates:true})}catch{return res.status(400).json({error:"Το αρχείο δεν διαβάστηκε ως έγκυρο Excel/CSV."})}
    const first=workbook.SheetNames[0];if(!first)return res.status(400).json({error:"Το αρχείο δεν περιέχει φύλλο δεδομένων."});
    const matrix=XLSX.utils.sheet_to_json(workbook.Sheets[first],{header:1,defval:"",raw:true,blankrows:false});
    const headerRow=findHeader(matrix);if(headerRow<0)return res.status(400).json({error:"Δεν εντοπίστηκε αναγνωρίσιμη γραμμή επικεφαλίδων στο export Kiosk."});
    const parsed=normalizeRows(matrix,headerRow);
    if(!parsed.rows.length)return res.status(400).json({error:"Δεν βρέθηκαν έγκυρες κινήσεις με ημερομηνία και ποσό."});
    if(parsed.rows.length>5000)return res.status(400).json({error:"Το αρχείο έχει πάνω από 5.000 κινήσεις. Χώρισέ το σε μικρότερες περιόδους."});
    await ensureSchema();
    const suppliers=await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true`;
    const supplierMap=new Map(suppliers.map(row=>[strip(row.name),row]));
    let inserted=0,duplicates=0;
    await prisma.$transaction(async tx=>{
      for(const row of parsed.rows){
        const supplier=supplierMap.get(strip(row.supplierName))||null;
        const fingerprint=crypto.createHash("sha256").update([req.user.companyId,store.id,row.occurredAt.toISOString().slice(0,10),row.type,row.amount.toFixed(2),strip(row.supplierName),strip(row.description),strip(row.sourceRef)].join("|")).digest("hex");
        const result=await tx.$queryRaw`
          INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","actorId","actorName","occurredAt","sourceType","sourceRef","sourceHash","importedAt")
          VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},NULL,${row.type},${row.amount},${row.description},${supplier?.id||null},${row.supplierName||null},false,${req.user.id},${req.user.fullName||"Χρήστης"},${row.occurredAt},'KIOSK_IMPORT',${row.sourceRef||body.filename},${fingerprint},NOW())
          ON CONFLICT DO NOTHING RETURNING "id"
        `;
        if(result[0])inserted++;else duplicates++;
      }
    });
    res.status(201).json({ok:true,store,filename:body.filename,sheet:first,headerRow:headerRow+1,found:parsed.rows.length,inserted,duplicates,skipped:parsed.skipped,message:`Εισήχθησαν ${inserted} πραγματικές κινήσεις Kiosk στο ${store.name}.`});
  }catch(error){next(error)}
});

export default router;
