const text=value=>String(value??'').trim();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

// Internal department numbers are not fiscal VAT codes. No fiscal code or
// legal exemption is inferred from this catalogue import.
export const ACHARNON_DEPARTMENTS=[
 [1,'ΚΑΠΝΟΒΙΟΜΗΧ',0,true],[2,'ΕΛΛΗΝΙΚΟΣ ΤΥΠΟΣ',0,true],[3,'ΚΑΡΤΕΣ',0,true],
 [4,'ΔΙΑΦΟΡΑ 6%',6,true],[5,'ΔΙΑΦΟΡΑ 13%',13,true],[6,'ΔΙΑΦΟΡΑ 24%',24,true],
 [7,'ΠΑΡΟΧΗ ΥΠΗΡ.',24,false],[8,'ΕΙΣΙΤΗΡΙΑ',0,true],[9,'ΣΚΡΑΤΣ',0,true],
 [17,'ΠΕΡΙΒΑΛΛ. ΤΕΛΟΣ',24,false],[18,'ΕΙΣΦ.ΠΡΟΣΤ.ΠΕΡΙΒ.',24,false]
].map(([cashRegisterDepartment,description,vatRate,commerce])=>({cashRegisterDepartment,description,vatRate,commerce,legacyVatCode:String(cashRegisterDepartment)}));

export async function assertAcharnonEmptyStore(db,companyId,storeId){
 const saved=await db.$queryRaw`SELECT sp."id" FROM "StoreProduct" sp JOIN "Store" s ON s."id"=sp."storeId" WHERE s."companyId"=${companyId} AND s."id"=${storeId} LIMIT 1`;
 if(saved.length)fail('Η πρώτη εισαγωγή Αχαρνών απαιτεί κενό κατάστημα. Δεν έγινε νέα εισαγωγή.',409);
}

export async function allocateAcharnonSkus(db,companyId,storeId,rows){
 // Same company lock and numeric sequence as createInventoryCard. Allocate
 // only in the final transaction, never reserve or persist codes in preview.
 await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId+':product-sku'}))`;
 await assertAcharnonEmptyStore(db,companyId,storeId);
 return allocateCatalogSkus(db,companyId,rows);
}

export async function allocateCatalogSkus(db,companyId,rows){
 await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId+':product-sku'}))`;
 const result=await db.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${companyId}`;
 const value=String(result[0]?.next??'');
 if(!/^\d+$/.test(value))fail('Δεν επιβεβαιώθηκε η επόμενη εσωτερική αρίθμηση.',409);
 const first=BigInt(value);
 if(first<1n||first+BigInt(rows.length)>9223372036854775807n)fail('Εξαντλήθηκε η εσωτερική αρίθμηση.',409);
 return rows.map((row,i)=>({...row,sku:String(first+BigInt(i))}));
}

export function attachAcharnonWorkbook(workbook,raw,XLSX){
 const read=name=>{if(!workbook.Sheets[name])fail(`Λείπει το φύλλο ${name} από το πακέτο Αχαρνών.`);return XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:''});};
 const meta=read('ACHARNON_META');
 if(meta.length!==1||meta[0].Profile!=='ACHARNON_CATALOG_V1'||!text(meta[0].CompanyId)||!text(meta[0].StoreId))fail('Μη έγκυρη ταυτότητα στόχου Αχαρνών.');
 const companyId=text(meta[0].CompanyId),storeId=text(meta[0].StoreId),definitions=read('ΤΜΗΜΑΤΑ'),ids=new Set();
 if(definitions.length!==11)fail('Χρειάζονται τα έντεκα ακριβή υπάρχοντα τμήματα Αχαρνών.');
 const departments=ACHARNON_DEPARTMENTS.map(expected=>{
  const matches=definitions.filter(d=>Number(d['Τμήμα ταμειακής'])===expected.cashRegisterDepartment),d=matches[0];
  if(matches.length!==1||text(d['Περιγραφή Kiosk'])!==expected.description||text(d['ΚΩΔ ΦΠΑ Kiosk'])!==expected.legacyVatCode||text(d.ΦΠΑ)===''||Number(d.ΦΠΑ)!==expected.vatRate||text(d['Εμπορία πηγής'])!==(expected.commerce?'ΝΑΙ':'ΟΧΙ')||!text(d.DepartmentId)||ids.has(text(d.DepartmentId))||text(d['Κωδικός ΦΠΑ ταμειακής']))fail(`Ασυμφωνία πηγής για το τμήμα Αχαρνών ${expected.cashRegisterDepartment}.`);
  ids.add(text(d.DepartmentId));
  return {...expected,id:text(d.DepartmentId),exemptionCode:text(d.ExemptionCode),exemptionDescription:text(d.ExemptionDescription)};
 });
 const byKey=new Map();
 for(const row of raw){
  const key=row.SourceKey;
  if(typeof key!=='string'||key!==text(key)||!/^[-.\w]{1,80}$/.test(key)||byKey.has(key))fail('Λείπει ή επαναλαμβάνεται αναφορά κωδικού πηγής.');
  if(['SKU','Κωδικός','ΚΩΔΙΚΟΣ','Εσωτ. κωδικός','Εσωτερικός κωδικός','Code','Νέος κωδικός MyWorkStation'].some(k=>text(row[k])))fail('Οι νέοι κωδικοί Αχαρνών εκδίδονται μόνο από το πρόγραμμα.');
  if(!departments.some(d=>d.description===text(row['Τμήμα ΦΠΑ']))||text(row['Κωδικός ΦΠΑ ταμειακής']))fail(`Άγνωστο ή μη επιβεβαιωμένο τμήμα για ${key}.`);
  byKey.set(key,{row,barcodes:[],primary:null});
 }
 const pairs=read('BARCODES_IMPORT'),owners=new Set();
 if(pairs.length>50000)fail('Υπερβολικός αριθμός barcode στο πακέτο.');
 for(const pair of pairs){
  const target=byKey.get(pair.SourceKey),barcode=pair.Barcode,role=text(pair['Ρόλος']);
  if(!target||typeof barcode!=='string'||!/^\d{1,80}$/.test(barcode)||owners.has(barcode)||!['ΚΥΡΙΟ','ΠΡΟΣΘΕΤΟ'].includes(role))fail(`Αμφίβολο, διπλό ή μη έγκυρο barcode Αχαρνών ${text(barcode)}.`);
  if(role==='ΚΥΡΙΟ'){if(target.primary!==null)fail('Δύο κύρια barcode στην ίδια αναφορά πηγής.');target.primary=barcode;}
  target.barcodes.push(barcode);owners.add(barcode);
 }
 for(const [key,target] of byKey){
  if(typeof target.row.Barcode!=='string'||target.row.Barcode!==(target.primary??''))fail(`Ασυμφωνία κύριου barcode για ${key}.`);
  Object.defineProperty(target.row,'sourceBarcodes',{value:target.barcodes});
 }
 Object.defineProperty(raw,'sourceProfile',{value:{name:'ACHARNON_CATALOG_V1',departments,barcodeCount:pairs.length,
  assertTarget(company,store){if(company!==companyId||store!==storeId)fail('Το πακέτο Αχαρνών ανήκει σε διαφορετική εταιρεία ή κατάστημα.');},
  assertEmptyStore:assertAcharnonEmptyStore,allocateSkus:allocateAcharnonSkus
 }});
 return raw;
}

export function validateAcharnonDepartments(profile,departments){
 for(const expected of profile.departments){
  const matches=departments.filter(d=>d.description===expected.description),d=matches[0];
  if(matches.length!==1||d.id!==expected.id||Number(d.cashRegisterDepartment)!==expected.cashRegisterDepartment||text(d.legacyVatCode)!==expected.legacyVatCode||text(d.vatRate)===''||Number(d.vatRate)!==expected.vatRate||d.commerce!==expected.commerce||d.active!==true||text(d.exemptionCode)!==expected.exemptionCode||text(d.exemptionDescription)!==expected.exemptionDescription)fail(`Το αποθηκευμένο τμήμα Αχαρνών ${expected.description} άλλαξε ή δεν συμφωνεί με την πηγή.`);
 }
}
