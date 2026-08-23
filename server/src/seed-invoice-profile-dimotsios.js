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
