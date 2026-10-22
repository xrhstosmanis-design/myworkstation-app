const text=value=>String(value??'').trim();
const fail=message=>{const error=new Error(message);error.status=400;throw error};

// These are catalogue department identities, not VAT percentage codes.
// In particular DATECS VAT code 5 means 0% for both tobacco and cards.
export const RIZAREIO_DEPARTMENTS=[
  [1,'ΤΣΙΓΑΡΑ','001',0,true,5],
  [3,'ΚΑΡΤΕΣ','003',0,true,5],
  [4,'ΕΙΔΗ 13%','004',13,true,2],
  [5,'ΕΙΔΗ 24%','005',24,true,3],
  [7,'ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ','007',24,false,3]
].map(([cashRegisterDepartment,description,legacyVatCode,vatRate,commerce,fiscalVatCode])=>({cashRegisterDepartment,description,legacyVatCode,vatRate,commerce,fiscalVatCode}));

export function attachRizareioWorkbook(workbook,raw,XLSX){
  for(const name of ['RIZAREIO_META','ΤΜΗΜΑΤΑ','BARCODES_IMPORT'])if(!workbook.Sheets[name])fail(`Λείπει το φύλλο ${name} από το πακέτο Ριζαρείου.`);
  const read=name=>XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:''});
  const meta=read('RIZAREIO_META');
  if(meta.length!==1||meta[0].Profile!=='RIZAREIO_CATALOG_V1'||!text(meta[0].CompanyId)||!text(meta[0].StoreId))fail('Μη έγκυρη ταυτότητα εταιρείας/καταστήματος στο πακέτο Ριζαρείου.');
  const companyId=text(meta[0].CompanyId),storeId=text(meta[0].StoreId);
  const definitions=read('ΤΜΗΜΑΤΑ'),ids=new Set();
  if(definitions.length!==RIZAREIO_DEPARTMENTS.length)fail('Απαιτούνται τα πέντε ακριβή υπάρχοντα τμήματα Ριζαρείου.');
  const departments=RIZAREIO_DEPARTMENTS.map(expected=>{
    const matches=definitions.filter(d=>Number(d['Τμήμα ταμειακής'])===expected.cashRegisterDepartment),d=matches[0];
    if(matches.length!==1||text(d['Περιγραφή Kiosk'])!==expected.description||text(d['ΚΩΔ ΦΠΑ Kiosk'])!==expected.legacyVatCode||text(d.ΦΠΑ)===''||Number(d.ΦΠΑ)!==expected.vatRate||text(d['Εμπορία πηγής'])!==(expected.commerce?'ΝΑΙ':'ΟΧΙ')||Number(d['Κωδικός ΦΠΑ ταμειακής'])!==expected.fiscalVatCode||!text(d.DepartmentId)||ids.has(text(d.DepartmentId)))fail(`Ασυμφωνία πηγής για το τμήμα ${expected.legacyVatCode}.`);
    ids.add(text(d.DepartmentId));
    return {...expected,id:text(d.DepartmentId),exemptionCode:text(d.ExemptionCode),exemptionDescription:text(d.ExemptionDescription)};
  });
  const bySku=new Map();
  for(const row of raw){
    const sku=text(row.SKU);
    if(typeof row.SKU!=='string'||!sku||bySku.has(sku))fail(`Λείπει, δεν είναι κείμενο ή επαναλαμβάνεται SKU ${sku}.`);
    const definition=departments.find(d=>d.description===text(row['Τμήμα ΦΠΑ']));
    if(!definition||Number(row['Κωδικός ΦΠΑ ταμειακής'])!==definition.fiscalVatCode)fail(`Άγνωστο ή ασύμφωνο φορολογικό τμήμα για ${sku}.`);
    bySku.set(sku,{row,barcodes:[],primary:null});
  }
  const pairs=read('BARCODES_IMPORT'),owners=new Set();
  if(pairs.length>50000)fail('Υπερβολικός αριθμός barcode στο πακέτο.');
  for(const pair of pairs){
    const sku=text(pair.SKU),barcode=text(pair.Barcode),target=bySku.get(sku),role=text(pair['Ρόλος']);
    if(!target)fail(`Το barcode ${barcode} αναφέρεται σε SKU εκτός IMPORT.`);
    if(typeof pair.Barcode!=='string'||pair.Barcode!==barcode||barcode.length>80||!(/^\d{1,80}$/.test(barcode)||barcode===`MWRZ-${sku}`))fail(`Μη έγκυρο κείμενο barcode ${barcode}.`);
    if(owners.has(barcode)||!['ΚΥΡΙΟ','ΠΡΟΣΘΕΤΟ'].includes(role))fail(`Διπλό barcode ή άγνωστος ρόλος ${barcode}.`);
    if(role==='ΚΥΡΙΟ'){
      if(target.primary!==null)fail(`Πολλαπλά κύρια barcode στο ${sku}.`);
      target.primary=barcode;
    }
    owners.add(barcode);target.barcodes.push(barcode);
  }
  for(const [sku,target] of bySku){
    if(typeof target.row.Barcode!=='string'||text(target.row.Barcode)!==(target.primary??''))fail(`Το κύριο barcode δεν συμφωνεί με το BARCODES_IMPORT για ${sku}.`);
    Object.defineProperty(target.row,'sourceBarcodes',{value:target.barcodes});
  }
  Object.defineProperty(raw,'sourceProfile',{value:{name:'RIZAREIO_CATALOG_V1',departments,barcodeCount:pairs.length,
    assertTarget(company,store){if(company!==companyId||store!==storeId)fail('Το πακέτο Ριζαρείου ανήκει σε διαφορετική εταιρεία ή κατάστημα.');}
  }});
  return raw;
}

export function validateRizareioDepartments(profile,departments){
  for(const expected of profile.departments){
    const matches=departments.filter(d=>d.description===expected.description),d=matches[0];
    if(matches.length!==1||d.id!==expected.id||Number(d.cashRegisterDepartment)!==expected.cashRegisterDepartment||text(d.legacyVatCode)!==expected.legacyVatCode||Number(d.vatRate)!==expected.vatRate||d.commerce!==expected.commerce||d.active!==true||text(d.exemptionCode)!==expected.exemptionCode||text(d.exemptionDescription)!==expected.exemptionDescription)fail(`Το αποθηκευμένο τμήμα ${expected.description} άλλαξε ή δεν συμφωνεί με την πηγή. Δεν δημιουργήθηκαν τμήματα ή είδη.`);
  }
}
