const text=value=>String(value??"").trim();
const fail=message=>{const error=new Error(message);error.status=400;throw error};
const requiredDepartments=[
  [1,"01.ΚΑΦΕΣ","1",13,true], [2,"02.ΕΙΔΗ 6","104",6,true],
  [3,"03.ΤΡΟΦΙΜΑ","7",13,true], [4,"04.ΕΙΔΗ 13","42",13,true],
  [5,"05.ΕΙΔΗ 24","15",24,true], [6,"06.ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ","227",24,false],
  [7,"07. ΠΕΡΙΒ. ΤΕΛΟΣ","17",24,false], [8,"08. ΕΙΣΦ.ΠΡΟΣΤ. ΠΕΡΙΒΑΛΛ","228",24,false],
  [9,"09. ΚΑΡΤΕΣ","45",0,true]
].map(([cashRegisterDepartment,description,legacyVatCode,vatRate,commerce])=>({cashRegisterDepartment,description,legacyVatCode,vatRate,commerce}));

// This explicit source profile does not broaden the legacy Diadochou mappings.
// Only the import sheet participates; review/excluded/reference sheets never do.
export function attachSourceWorkbook(workbook,raw,XLSX){
  if(workbook.SheetNames[0]!=="ΠΡΟΪΟΝΤΑ_IMPORT")return raw;
  if(!workbook.Sheets["ΤΜΗΜΑΤΑ"]||!workbook.Sheets.BARCODES_IMPORT)fail("Λείπουν ΤΜΗΜΑΤΑ ή BARCODES_IMPORT από το πακέτο εισαγωγής.");
  const definitions=XLSX.utils.sheet_to_json(workbook.Sheets["ΤΜΗΜΑΤΑ"],{defval:""}).filter(r=>r["Χρήση"]==="ΤΜΗΜΑΤΑ ΠΡΩΤΗΣ ΕΙΣΑΓΩΓΗΣ");
  if(definitions.length!==requiredDepartments.length)fail("Το πακέτο πρέπει να περιέχει τα εννέα ακριβή τμήματα πρώτης εισαγωγής.");
  for(const expected of requiredDepartments){
    const matches=definitions.filter(r=>Number(r["Τμήμα ταμειακής"])===expected.cashRegisterDepartment);
    const r=matches[0];
    if(matches.length!==1||text(r["Περιγραφή Kiosk"])!==expected.description||text(r["ΚΩΔ ΦΠΑ Kiosk"])!==expected.legacyVatCode||Number(r["ΦΠΑ"])!==expected.vatRate||text(r["Εμπορία πηγής"])!==(expected.commerce?"ΝΑΙ":"ΟΧΙ"))fail(`Ασυμφωνία πηγής για το τμήμα ${expected.cashRegisterDepartment}.`);
  }
  const bySku=new Map();
  for(const row of raw){
    const sku=text(row.SKU);if(!sku||bySku.has(sku))fail(`Λείπει ή επαναλαμβάνεται SKU ${sku}.`);
    bySku.set(sku,{row,barcodes:[],primary:null});
  }
  const pairs=XLSX.utils.sheet_to_json(workbook.Sheets.BARCODES_IMPORT,{defval:""}),owners=new Map();
  if(pairs.length>50000)fail("Υπερβολικός αριθμός barcode στο πακέτο.");
  for(const pair of pairs){
    const sku=text(pair.SKU),barcode=text(pair.Barcode),target=bySku.get(sku),role=text(pair["Ρόλος"]);
    if(!target)fail(`Το barcode ${barcode} αναφέρεται σε SKU εκτός IMPORT: ${sku}.`);
    if(typeof pair.Barcode!=="string"||!/^\d{1,80}$/.test(barcode))fail(`Το barcode ${barcode} πρέπει να είναι κείμενο με τα ακριβή ψηφία της πηγής.`);
    if(owners.has(barcode))fail(`Διπλό barcode ${barcode} (${owners.get(barcode)} / ${sku}).`);
    if(!["ΚΥΡΙΟ","ΠΡΟΣΘΕΤΟ"].includes(role))fail(`Άγνωστος ρόλος barcode ${barcode}.`);
    if(role==="ΚΥΡΙΟ"){
      if(target.primary!==null)fail(`Πολλαπλά κύρια barcode στο ${sku}.`);
      target.primary=barcode;
    }
    owners.set(barcode,sku);target.barcodes.push(barcode);
  }
  for(const [sku,target] of bySku){
    const primary=text(target.row.Barcode);
    if(primary&&(typeof target.row.Barcode!=="string"||primary!==target.primary))fail(`Το κύριο barcode δεν συμφωνεί με το BARCODES_IMPORT για ${sku}.`);
    if(!primary&&target.primary!==null)fail(`Απρόσμενο κύριο barcode για ${sku}.`);
    Object.defineProperty(target.row,"sourceBarcodes",{value:target.barcodes});
  }
  Object.defineProperty(raw,"sourceProfile",{value:{name:"DAILY_BITE_V2",departments:requiredDepartments,barcodeCount:pairs.length}});
  return raw;
}

export function validateSourceDepartments(profile,departments){
  if(!profile)return;
  for(const expected of profile.departments){
    const matches=departments.filter(d=>d.description===expected.description);
    const d=matches[0];
    if(matches.length!==1||Number(d.cashRegisterDepartment)!==expected.cashRegisterDepartment||text(d.legacyVatCode)!==expected.legacyVatCode||Number(d.vatRate)!==expected.vatRate||d.commerce!==expected.commerce||d.active!==true)fail(`Το αποθηκευμένο τμήμα ${expected.description} δεν συμφωνεί με την πηγή. Δεν δημιουργήθηκαν τμήματα ή είδη.`);
    if(expected.cashRegisterDepartment===9&&(text(d.exemptionCode)!=="27"||d.exemptionDescription!=="Λοιπές Εξαιρέσεις ΦΠΑ"))fail("Το τμήμα 09. ΚΑΡΤΕΣ χρειάζεται την επιβεβαιωμένη εξαίρεση 27 — Λοιπές Εξαιρέσεις ΦΠΑ.");
  }
}
