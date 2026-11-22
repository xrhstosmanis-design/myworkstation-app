import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import * as XLSX from "xlsx";

export const stripKioskPaymentText=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9α-ω]/g,"");
const money=value=>{
  if(value===null||value===undefined||value==="")return 0;
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  let raw=String(value).trim().replace(/\s/g,"").replace(/€/g,"");
  if(raw.includes(",")){raw=raw.replace(/\./g,"").replace(",",".")}
  else raw=raw.replace(/[^0-9.-]/g,"");
  const n=Number(raw);return Number.isFinite(n)?n:0;
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
  const normalized=headers.map(stripKioskPaymentText);
  for(const alias of names){const exact=normalized.findIndex(h=>h===alias);if(exact>=0)return exact}
  for(const alias of names){const fuzzy=normalized.findIndex(h=>h.includes(alias));if(fuzzy>=0)return fuzzy}
  return -1;
}
function findHeader(matrix){
  let best={row:-1,score:-1};
  for(let r=0;r<Math.min(matrix.length,35);r++){
    const h=(matrix[r]||[]).map(stripKioskPaymentText);
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
    const typeText=idx.type>=0?stripKioskPaymentText(raw[idx.type]):"";
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

export function parseKioskPaymentFile(filename,dataBase64){
  const fail=message=>{throw Object.assign(new Error(message),{status:400})};
  if(!/\.(xlsx|xls|csv)$/i.test(filename))fail("Επίλεξε αρχείο Excel (.xlsx/.xls) ή CSV.");
  const bytes=Buffer.from(dataBase64,"base64");
  if(bytes.length<20||bytes.length>8*1024*1024)fail("Το αρχείο πρέπει να είναι έως 8 MB.");
  let workbook;
  try{workbook=XLSX.read(bytes,{type:"buffer",cellDates:true});}catch{fail("Το αρχείο δεν διαβάστηκε ως έγκυρο Excel/CSV.");}
  const sheet=workbook.SheetNames[0];
  if(!sheet)fail("Το αρχείο δεν περιέχει φύλλο δεδομένων.");
  const matrix=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,defval:"",raw:true,blankrows:false});
  const headerRow=findHeader(matrix);
  if(headerRow<0)fail("Δεν εντοπίστηκε αναγνωρίσιμη γραμμή επικεφαλίδων στο export Kiosk.");
  const parsed=normalizeRows(matrix,headerRow);
  if(!parsed.rows.length)fail("Δεν βρέθηκαν έγκυρες κινήσεις με ημερομηνία και ποσό.");
  if(parsed.rows.length>5000)fail("Το αρχείο έχει πάνω από 5.000 κινήσεις. Χώρισέ το σε μικρότερες περιόδους.");
  return {...parsed,sheet,headerRow};
}

function previewMac(scope,file,expiresAt,secret){
  if(!secret)throw new Error("Missing Kiosk preview signing configuration");
  const bytesHash=createHash("sha256").update(Buffer.from(file.dataBase64,"base64")).digest("hex");
  return createHmac("sha256",secret).update(JSON.stringify([
    "kiosk-payment-preview-v1",scope.companyId,scope.storeId,scope.actorId,file.filename,bytesHash,expiresAt
  ])).digest("hex");
}

export function issueKioskPreview(scope,file,{secret=process.env.JWT_SECRET,now=Date.now()}={}){
  const expiresAt=now+15*60_000;
  return `${expiresAt}.${previewMac(scope,file,expiresAt,secret)}`;
}

export function verifyKioskPreview(scope,file,receipt,{secret=process.env.JWT_SECRET,now=Date.now()}={}){
  const match=/^(\d{13})\.([a-f0-9]{64})$/.exec(receipt??"");
  if(!match||Number(match[1])<=now||!secret)return false;
  const expected=previewMac(scope,file,Number(match[1]),secret);
  return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(match[2],"hex"));
}
