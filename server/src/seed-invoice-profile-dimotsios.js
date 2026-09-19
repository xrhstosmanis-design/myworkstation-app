import {prisma} from "./prisma.js";

const supplierKey="061656254";
const supplierName="ΔΗΜΟΤΣΙΟΣ ΑΝΑΣΤΑΣΙΟΣ ΛΑΖΑΡΟΣ";
const profile={
  supplierName,
  supplierTaxId:supplierKey,
  ruleKey:"DIMOTSIOS_DAIRY",
  central:true,
  source:"MANUAL_VERIFIED_INVOICE_LEARNING",
  verifiedInvoiceExample:{date:"2026-08-20",number:"013433",netTotal:107.20,vatTotal:13.94,grossTotal:121.14,totalQuantity:87},
  mappings:{
    "1197":{supplierItemCode:"1197",description:"ΚΕΦΙΡ 1/2lt ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.42,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1195":{supplierItemCode:"1195",description:"ΚΑΚΑΟ 1/2lt ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.50,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1200":{supplierItemCode:"1200",description:"ΚΕΦΙΡ ΚΑΤΣΙΚΙΣΙΟ BIO 500ml",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.60,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "022":{supplierItemCode:"022",description:"ΖΕΛΕ ΦΡΑΟΥΛΑ ΚΙΣΣΑΣ 200gr",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:0.99,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1214":{supplierItemCode:"1214",description:"ΚΡΕΜΑ ΣΟΚΟΛΑΤΑ 180gr ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.10,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "037":{supplierItemCode:"037",description:"ΚΡΕΜΑ ΜΠΙΣΚΟΤΟ ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.00,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1213":{supplierItemCode:"1213",description:"ΚΡΕΜΑ ΒΑΝΙΛΙΑ 180gr ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.00,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1215":{supplierItemCode:"1215",description:"ΡΥΖΟΓΑΛΟ 180gr ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.00,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "048":{supplierItemCode:"048",description:"ΓΙΑΟΥΡΤΙ ΝΤΟΠΙΟ 10% 200gr",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.30,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1217":{supplierItemCode:"1217",description:"ΚΡΕΜΑ ΒΑΝΙΛΙΑ ΜΕ ΣΤΕΒΙΑ 180gr",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.25,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "036":{supplierItemCode:"036",description:"ΚΡΕΜΑ 50-50 ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.10,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true},
    "1202":{supplierItemCode:"1202",description:"ΓΙΑΟΥΡΤΙ ΠΡΟΒΕΙΟ 280gr ΓΑΪΤΑΝΙΔΗΣ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,unitPrice:1.60,discount1:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true}
  }
};

const normalizedName=supplierName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedAt") VALUES ($1,$2,$3,$4,$5,1,$6::jsonb,TRUE,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profile"=COALESCE("InvoiceSupplierReadingProfile"."profile",'{}'::jsonb) || EXCLUDED."profile","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`,supplierKey,supplierKey,supplierName,normalizedName,profile.ruleKey,JSON.stringify(profile));
console.log("Invoice Learning verified supplier profile seeded: DIMOTSIOS 061656254.");

// CHECKPOINT_VERIFIED_2612188: these are only the relative printed columns of
// STEFANIDIS invoices. They never reuse the old invoice's quantities, prices,
// totals, product IDs or attachments; every future row must still balance from
// its own source text before the profile can apply.
const stefanidisKey="998878583";
const stefanidisName="ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ";
const stefanidisProfile={
  supplierName:stefanidisName,
  supplierTaxId:stefanidisKey,
  ruleKey:"STEFANIDIS_PRINTED_COLUMNS",
  central:true,
  source:"CHECKPOINT_VERIFIED_2612188",
  readingRule:{
    confirmedColumnLayouts:{
      "1,2,3,4,5,6,7,-1":{quantity:1,unitCost:2,retailPrice:-1}
    }
  }
};
const stefanidisNormalized=stefanidisName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedAt") VALUES ($1,$2,$3,$4,$5,1,$6::jsonb,TRUE,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profile"=COALESCE("InvoiceSupplierReadingProfile"."profile",'{}'::jsonb) || EXCLUDED."profile","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`,stefanidisKey,stefanidisKey,stefanidisName,stefanidisNormalized,stefanidisProfile.ruleKey,JSON.stringify(stefanidisProfile));
console.log("Invoice Learning checkpoint-verified supplier profile seeded: STEFANIDIS 998878583.");

// The food/confectionery company uses a different printed table from the
// cigarette company above. Store only the layout rule; every future row must
// prove quantity × unit price = pre-discount value and pre-discount value −
// discount = net value before it can be corrected.
const stefanidisFoodKey="997763585";
const stefanidisFoodName="ΑΦΟΙ Ι ΣΤΕΦΑΝΙΔΗ Α.Ε.";
const stefanidisFoodProfile={supplierName:stefanidisFoodName,supplierTaxId:stefanidisFoodKey,ruleKey:"STEFANIDIS_FOOD_PRINTED_COLUMNS",central:true,source:"VERIFIED_PRINTED_LAYOUT_620889"};
const stefanidisFoodNormalized=stefanidisFoodName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedAt") VALUES ($1,$2,$3,$4,$5,1,$6::jsonb,TRUE,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profile"=COALESCE("InvoiceSupplierReadingProfile"."profile",'{}'::jsonb) || EXCLUDED."profile","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`,stefanidisFoodKey,stefanidisFoodKey,stefanidisFoodName,stefanidisFoodNormalized,stefanidisFoodProfile.ruleKey,JSON.stringify(stefanidisFoodProfile));
console.log("Invoice Learning verified printed layout seeded: STEFANIDIS FOOD 997763585.");

// CHECKPOINT_VERIFIED_TDLPIX14_15: Λεβεντόπουλος rows print the packaging
// measurement (ΜΜ) before ΠΟΣ1.  Only ΠΟΣ1 is the actual stock quantity.
// The runtime still requires the same physical row to balance before applying
// this supplier-only rule; it does not reuse this invoice's values.
const leventopoulosKey="800503361";
const leventopoulosName="Σ ΛΕΒΕΝΤΟΠΟΥΛΟΣ ΕΜΠΟΡΙΑ ΚΑΠΝΟΒΙΟΜΗΧΑΝΙΚΩΝ ΚΑΙ ΛΟΙΠΩΝ ΠΡΟΪΟΝΤΩΝ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ";
const leventopoulosProfile={
  supplierName:leventopoulosName,
  supplierTaxId:leventopoulosKey,
  ruleKey:"LEVENTOPOULOS_MM_POS1_COLUMNS",
  central:true,
  source:"CHECKPOINT_VERIFIED_TDLPIX14_15",
  readingRule:{layoutMode:"LEVENTOPOULOS_MM_POS1_COLUMNS",quantityColumn:"ΠΟΣ1",ignoredColumns:["ΜΜ","ΠΟΣ2"]}
};
const leventopoulosNormalized=leventopoulosName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedAt") VALUES ($1,$2,$3,$4,$5,1,$6::jsonb,TRUE,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profile"=COALESCE("InvoiceSupplierReadingProfile"."profile",'{}'::jsonb) || EXCLUDED."profile","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`,leventopoulosKey,leventopoulosKey,leventopoulosName,leventopoulosNormalized,leventopoulosProfile.ruleKey,JSON.stringify(leventopoulosProfile));
console.log("Invoice Learning verified supplier profile seeded: LEVENTOPOULOS 800503361.");
