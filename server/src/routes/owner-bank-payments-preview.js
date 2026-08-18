import {Router} from "express";
import * as XLSX from "xlsx";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const schema=z.object({storeId:z.string().trim().min(1),filename:z.string().trim().min(1).max(180),dataBase64:z.string().min(20).max(11500000)});
const strip=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9α-ω]/g,"");
const cleanIban=v=>String(v??"").toUpperCase().replace(/\s/g,"").replace(/[^A-Z0-9]/g,"");
const cleanTax=v=>String(v??"").replace(/\D/g,"");
const amount=v=>{if(typeof v==="number")return Number.isFinite(v)?Math.abs(v):0;let raw=String(v??"").trim().replace(/\s/g,"").replace(/€/g,"");if(raw.includes(","))raw=raw.replace(/\./g,"").replace(",",".");else raw=raw.replace(/[^0-9.-]/g,"");const n=Number(raw);return Number.isFinite(n)?Math.abs(n):0};
function dateValue(v){if(v instanceof Date&&Number.isFinite(v.getTime()))return v;if(typeof v==="number"){const p=XLSX.SSF.parse_date_code(v);if(p)return new Date(p.y,p.m-1,p.d,p.H||0,p.M||0,Math.floor(p.S||0))}const t=String(v??"").trim(),m=t.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12);const d=new Date(t);return Number.isFinite(d.getTime())?d:null}
const aliases={date:["ημερομηνια","date","valuedate","bookingdate"],amount:["ποσο","amount","debit","χρεωση","ποσοχρεωσης"],beneficiary:["δικαιουχος","beneficiary","counterparty","αντισυμβαλλομενος","ονομα"],description:["αιτιολογια","description","details","περιγραφη","memo"],iban:["iban","λογαριασμος","account"],reference:["reference","transactionid","transaction","ref","κωδικοςσυναλλαγης","ταυτοτητασυναλλαγης"],taxId:["αφμ","taxid","vatnumber"]};
function col(headers,names){const n=headers.map(strip);for(const a of names){const i=n.findIndex(x=>x===a);if(i>=0)return i}for(const a of names){const i=n.findIndex(x=>x.includes(a));if(i>=0)return i}return -1}
function findHeader(matrix){let best={row:-1,score:-1};for(let r=0;r<Math.min(40,matrix.length);r++){const h=(matrix[r]||[]).map(strip),score=Object.values(aliases).filter(group=>group.some(a=>h.some(c=>c===a||c.includes(a)))).length;if(score>best.score)best={row:r,score}}return best.score>=2?best.row:-1}
function parseRows(matrix,headerRow){const h=matrix[headerRow]||[],idx=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,col(h,v)]));if(idx.date<0||idx.amount<0)throw Object.assign(new Error("Δεν βρέθηκαν οι απαραίτητες στήλες Ημερομηνία και Ποσό."),{status:400});const rows=[];let skipped=0;for(const raw of matrix.slice(headerRow+1)){const d=dateValue(raw[idx.date]),money=amount(raw[idx.amount]);if(!d||!(money>0)){skipped++;continue}rows.push({date:d,amount:Math.round((money+Number.EPSILON)*100)/100,beneficiary:idx.beneficiary>=0?String(raw[idx.beneficiary]??"").trim():"",description:idx.description>=0?String(raw[idx.description]??"").trim():"",iban:idx.iban>=0?cleanIban(raw[idx.iban]):"",reference:idx.reference>=0?String(raw[idx.reference]??"").trim():"",taxId:idx.taxId>=0?cleanTax(raw[idx.taxId]):""})}return {rows,skipped,columns:idx}}
function supplierScore(row,supplier){let score=0,reasons=[];const rk=strip(`${row.beneficiary} ${row.description}`),sk=strip(supplier.name);if(row.taxId&&cleanTax(supplier.taxId)===row.taxId){score+=100;reasons.push("ΑΦΜ")}if(row.iban&&supplier.iban&&cleanIban(supplier.iban)===row.iban){score+=100;reasons.push("IBAN")}if(sk.length>=5&&rk.includes(sk)){score+=70;reasons.push("Επωνυμία")}else if(sk.length>=7&&rk&&sk.includes(strip(row.beneficiary))){score+=45;reasons.push("Παρόμοια επωνυμία")}return {score,reasons}}

router.post("/preview-bank",async(req,res,next)=>{try{
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η εισαγωγή τράπεζας επιτρέπεται μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  const body=schema.parse(req.body||{});if(!/\.(xlsx|xls|csv)$/i.test(body.filename))return res.status(400).json({error:"Επίλεξε Excel (.xlsx/.xls) ή CSV."});
  const store=await prisma.store.findFirst({where:{id:body.storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await prisma.$executeRawUnsafe('ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "iban" TEXT');
  const bytes=Buffer.from(body.dataBase64,"base64");if(bytes.length<20||bytes.length>8*1024*1024)return res.status(400).json({error:"Το αρχείο πρέπει να είναι έως 8 MB."});
  let workbook;try{workbook=XLSX.read(bytes,{type:"buffer",cellDates:true})}catch{return res.status(400).json({error:"Το αρχείο δεν διαβάστηκε ως Excel/CSV."})}
  const sheet=workbook.SheetNames[0];if(!sheet)return res.status(400).json({error:"Το αρχείο δεν έχει φύλλο δεδομένων."});
  const matrix=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,defval:"",raw:true,blankrows:false}),headerRow=findHeader(matrix);if(headerRow<0)return res.status(400).json({error:"Δεν εντοπίστηκε αναγνωρίσιμη γραμμή επικεφαλίδων."});
  const parsed=parseRows(matrix,headerRow);if(!parsed.rows.length)return res.status(400).json({error:"Δεν βρέθηκαν έγκυρες τραπεζικές κινήσεις."});
  const suppliers=await prisma.$queryRaw`SELECT "id","name","taxId","iban" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`;
  const docs=await prisma.$queryRaw`SELECT d."id",d."supplierId",d."documentNumber",d."documentDate",d."totalGross",d."status",s."name" AS "supplierName" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" WHERE d."companyId"=${req.user.companyId} AND d."storeId"=${store.id} AND d."status" IN ('DRAFT','APPROVED') ORDER BY d."documentDate" DESC LIMIT 3000`;
  const results=[];
  for(const row of parsed.rows){
    const ranked=suppliers.map(s=>({...s,...supplierScore(row,s)})).sort((a,b)=>b.score-a.score);const supplier=ranked[0]?.score>=45?ranked[0]:null;
    const candidates=docs.filter(d=>supplier&&d.supplierId===supplier.id).map(d=>{const gross=Number(d.totalGross||0),diff=Math.abs(gross-row.amount),days=Math.abs((new Date(d.documentDate).getTime()-row.date.getTime())/86400000);let score=0;if(diff<=0.01)score+=100;else if(diff<=0.05)score+=90;else if(diff<=Math.max(1,row.amount*.02))score+=50;if(days<=7)score+=20;else if(days<=31)score+=10;return {...d,totalGross:gross,diff,score}}).sort((a,b)=>b.score-a.score||a.diff-b.diff);
    const invoice=candidates[0]?.score>=90?candidates[0]:null;
    results.push({date:row.date.toISOString(),amount:row.amount,beneficiary:row.beneficiary,description:row.description,iban:row.iban,reference:row.reference,taxId:row.taxId,supplier:supplier?{id:supplier.id,name:supplier.name,taxId:supplier.taxId||null,iban:supplier.iban||null,score:supplier.score,reasons:supplier.reasons}:null,invoice:invoice?{id:invoice.id,documentNumber:invoice.documentNumber,documentDate:invoice.documentDate,totalGross:invoice.totalGross,status:invoice.status,difference:invoice.diff}:null,status:supplier&&invoice?"MATCHED":"PENDING"});
  }
  res.json({ok:true,previewOnly:true,message:"Προεπισκόπηση μόνο — δεν καταχωρίστηκε καμία τραπεζική πληρωμή.",store,filename:body.filename,sheet,headerRow:headerRow+1,skipped:parsed.skipped,count:results.length,matched:results.filter(r=>r.status==='MATCHED').length,pending:results.filter(r=>r.status==='PENDING').length,rows:results});
}catch(error){next(error)}});

export default router;
