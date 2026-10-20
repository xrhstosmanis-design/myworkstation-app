const text=v=>String(v??'').trim();
const fail=message=>{const e=new Error(message);e.status=409;throw e;};
export const KAT_DEPARTMENTS=[
  [1,'01.ΚΑΦΕΣ','1',13,true],[2,'02.ΕΙΔΗ 13','42',13,true],
  [4,'04.ΤΡΟΦΙΜΑ','7',13,true],[6,'06.ΕΙΔΗ 24','15',24,true],
  [6,'06.ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ','227',24,false],[7,'07. ΚΑΡΤΕΣ','45',0,true],
  [8,'08.ΕΙΔΗ 6','104',6,true],[13,'13. ΠΕΡΙΒ. ΤΕΛΟΣ','17',24,false],
  [14,'14. ΕΙΣΦ.ΠΡΟΣΤ. ΠΕΡΙΒΑΛΛ','228',24,false]
].map(([cashRegisterDepartment,description,legacyVatCode,vatRate,commerce])=>({cashRegisterDepartment,description,legacyVatCode,vatRate,commerce}));

export function validateKatDepartments(profile,departments){
  const bindings={};
  for(const expected of profile.departments){
    // Register 6 has TWO different departments. Never match by rate/register alone.
    const matches=departments.filter(d=>Number(d.cashRegisterDepartment)===expected.cashRegisterDepartment&&text(d.legacyVatCode)===expected.legacyVatCode&&Number(d.vatRate)===expected.vatRate&&d.commerce===expected.commerce);
    if(matches.length!==1||matches[0].active!==true)fail(`Λείπει ή είναι αμφίβολο το ακριβές τμήμα ΚΑΤ ${expected.description} (κωδικός ${expected.legacyVatCode}). Δεν έγινε εισαγωγή.`);
    bindings[expected.description]=matches[0].id;
  }
  profile.departmentBindings=bindings;
}

export function attachKatWorkbook(workbook,raw,XLSX){
  const read=name=>{if(!workbook.Sheets[name])fail(`Λείπει ${name} από το πακέτο ΚΑΤ.`);return XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:''});};
  const meta=read('KAT_META');
  if(meta.length!==1||meta[0].Profile!=='KAT_CATALOG_V1'||!text(meta[0].CompanyId)||!text(meta[0].StoreId))fail('Μη έγκυρος στόχος εισαγωγής ΚΑΤ.');
  const defs=read('ΤΜΗΜΑΤΑ');
  if(defs.length!==9)fail('Χρειάζονται τα εννέα ακριβή τμήματα ΚΑΤ.');
  for(const d of KAT_DEPARTMENTS){
    const matches=defs.filter(r=>text(r['Περιγραφή Kiosk'])===d.description);
    const r=matches[0];
    if(matches.length!==1||Number(r['Τμήμα ταμειακής'])!==d.cashRegisterDepartment||text(r['ΚΩΔ ΦΠΑ Kiosk'])!==d.legacyVatCode||Number(r.ΦΠΑ)!==d.vatRate||text(r['Εμπορία πηγής'])!==(d.commerce?'ΝΑΙ':'ΟΧΙ'))fail(`Ασυμφωνία πηγής ΚΑΤ ${d.description}.`);
  }
  const bySku=new Map(),existing=new Map();
  for(const row of raw){const sku=text(row.SKU);if(!/^KAT-\d+$/.test(sku)||bySku.has(sku))fail(`Μη μοναδικός κωδικός ΚΑΤ ${sku}.`);bySku.set(sku,{row,barcodes:[],primary:null});}
  const ids=new Set();
  for(const r of read('EXISTING_IMPORT')){
    const sku=text(r.SKU),id=text(r.ProductId),oldSku=text(r.ExistingSku),fingerprint=text(r.Fingerprint);
    if(!bySku.has(sku)||existing.has(sku)||!id||!oldSku||!/[a-f0-9]{32}/.test(fingerprint)||fingerprint.length!==32||ids.has(id))fail(`Μη έγκυρη αντιστοίχιση υπάρχοντος είδους ${sku}.`);
    existing.set(sku,{id,oldSku,fingerprint});ids.add(id);
  }
  const pairs=read('BARCODES_IMPORT'),owners=new Set();
  if(pairs.length>50000)fail('Υπερβολικός αριθμός barcode.');
  for(const r of pairs){const sku=text(r.SKU),barcode=text(r.Barcode),role=text(r['Ρόλος']),target=bySku.get(sku);
    const validAlias=/^\d{1,80}$/.test(barcode)||barcode==='FREDDO ESPRESO 4PLO';
    if(!target||typeof r.Barcode!=='string'||!validAlias||owners.has(barcode)||!['ΚΥΡΙΟ','ΠΡΟΣΘΕΤΟ'].includes(role))fail(`Αμφίβολο ή μη έγκυρο barcode ΚΑΤ ${barcode}.`);
    if(role==='ΚΥΡΙΟ'){if(target.primary!==null)fail(`Δύο κύρια barcode ${sku}.`);target.primary=barcode;}
    target.barcodes.push(barcode);owners.add(barcode);
  }
  for(const [sku,t] of bySku){if(text(t.row.Barcode)!==(t.primary??''))fail(`Ασυμφωνία κύριου barcode ${sku}.`);Object.defineProperty(t.row,'sourceBarcodes',{value:t.barcodes});}
  const profile={name:'KAT_CATALOG_V1',departments:KAT_DEPARTMENTS.map(d=>({...d})),barcodeCount:pairs.length,existing,
    assertTarget(companyId,storeId){if(companyId!==text(meta[0].CompanyId)||storeId!==text(meta[0].StoreId))fail('Το πακέτο ΚΑΤ προορίζεται για διαφορετικό κατάστημα ή εταιρεία.');},
    async lockExisting(db,companyId,storeId){
      const productIds=[...ids].sort();if(!productIds.length)return;
      // The older barcode writers do not share one row/table lock order.
      // Refuse a busy existing row immediately instead of forming a wait cycle
      // while the import holds the existing barcode-table collision barrier.
      try{
        await db.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${productIds}::text[]) ORDER BY "id" FOR UPDATE NOWAIT`;
        await db.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=ANY(${productIds}::text[]) ORDER BY "id" FOR UPDATE NOWAIT`;
      }catch(error){if(error.code==='55P03'||error.meta?.code==='55P03')fail('Ένα υπάρχον είδος ενημερώνεται τώρα. Δεν έγινε εισαγωγή. Κάντε νέα προεπισκόπηση.');throw error;}
    },
    async reconcile(db,companyId,storeId,rows){
      const productIds=[...ids];
      const current=productIds.length?await db.$queryRaw`SELECT p."id",p."sku",p."unit",sp."currentStock",
        md5(json_build_object('product',row_to_json(p),'barcodes',COALESCE((SELECT json_agg(b."barcode" ORDER BY b."barcode") FROM "ProductBarcode" b WHERE b."productId"=p."id"),'[]'::json))::text) AS fingerprint,
        EXISTS(SELECT 1 FROM "StoreProduct" other WHERE other."productId"=p."id" AND other."storeId"<>${storeId}) AS "otherStore"
        FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId}
        WHERE p."companyId"=${companyId} AND p."id"=ANY(${productIds}::text[])`:[];
      const byId=new Map(current.map(r=>[r.id,r]));
      for(const row of rows){const expected=existing.get(row.sku);if(!expected)continue;const saved=byId.get(expected.id);
        if(row.action!=='UPDATE'||row.productId!==expected.id||!saved||saved.sku!==expected.oldSku||saved.unit!==row.unit||saved.fingerprint!==expected.fingerprint||saved.otherStore){row.errors.push('Άλλαξε ή δεν συμφωνεί η επιβεβαιωμένη καρτέλα υπάρχοντος είδους. Χρειάζεται νέα προεπισκόπηση.');row.action='INVALID';}
        else row.expectedStock=Number(saved.currentStock??0);
      }
    }
  };
  Object.defineProperty(raw,'sourceProfile',{value:profile});return raw;
}
