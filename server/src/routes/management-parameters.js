import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const uid=()=>crypto.randomUUID();
const sections=new Set(["business","banks","edelivery","pos","backoffice","shifts","customers","email","other","purchases"]);
let schemaPromise;

const secretKey=()=>crypto.createHash("sha256").update(String(process.env.PARAMETERS_ENCRYPTION_KEY||process.env.JWT_SECRET||""),"utf8").digest();
const encrypt=value=>{
  if(!value)return null;
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",secretKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
};

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementParameters" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL UNIQUE,
        "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "woltPasswordEnc" TEXT,
        "efoodPasswordEnc" TEXT,
        "aadePasswordEnc" TEXT,
        "managerPinEnc" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ManagementParameters" ADD COLUMN IF NOT EXISTS "managerPinEnc" TEXT`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementParameters_company_idx" ON "ManagementParameters" ("companyId")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementParameterAudit" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "section" TEXT NOT NULL,
        "actorId" TEXT,
        "actorName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementParameterAudit_company_created_idx" ON "ManagementParameterAudit" ("companyId","createdAt" DESC)`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Οι Παράμετροι είναι διαθέσιμες μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

const optText=max=>z.string().trim().max(max).optional().nullable();
const bool=z.coerce.boolean().optional();
const num=(min,max)=>z.coerce.number().min(min).max(max).optional();
const businessSchema=z.object({
  name:z.string().trim().min(1).max(180).optional(),tradeTitle:optText(180),taxId:optText(30),gemi:optText(40),taxOffice:optText(120),profession:optText(220),address:optText(220),city:optText(120),postalCode:optText(20),region:optText(120),phone:optText(50),mobile1:optText(50),mobile2:optText(50),edpa:bool,distinctiveTitleEnabled:bool,vatMode:z.enum(["NORMAL","REDUCED"]).optional(),autoVatUpdate:bool,invoiceMessage:optText(500),slogan:optText(220),storeDescription:optText(220),logoPath:optText(500),website:optText(300),erpCode:optText(80)
}).passthrough();
const banksSchema=z.object({bankAccounts:z.array(z.object({name:z.string().trim().max(180).default(""),iban:z.string().trim().max(80).default("")})).max(4).optional()}).passthrough();
const edeliverySchema=z.object({woltVenueId:optText(120),woltBaseUrl:optText(500),woltUsername:optText(180),woltPassword:optText(500),efoodVendorId:optText(120),efoodUrl:optText(500),efoodUsername:optText(180),efoodPassword:optText(500),syncPriceWithBase:bool}).passthrough();
const posSchema=z.object({
  showShiftTransactionNumber:bool,showShiftNumberWithOperator:bool,onlineBarcodeLookup:bool,showDiscountColumn:bool,showTransactionCode:bool,reverseProductSort:bool,separatorPerScan:bool,groupReceipt:bool,oneClickCardOrMixedPayment:bool,paypod:bool,businessUnitsSupplierPayment:bool,mixedPaymentConfirmation:bool,invoiceProductIdentification:z.enum(["DESCRIPTION","INTERNAL_CODE","BARCODE"]).optional(),operatorPinLogin:bool,fullscreenStart:bool,autoRefreshNoteCounter:bool,registerZ:bool,printNonFiscal:bool,unlimitedOpenCashiers:bool,printOrderItems:bool,askOrderPrint:bool,hotkeys2:bool,hotkeys3:bool,hotkeys4:bool,hotkeysCategories:bool,lockHotkeys:bool,defaultHotkeys:z.enum(["ONE","CATEGORIES"]).optional(),bottomHotkeys:bool,barcodeNotFoundSound:bool,descriptionFontSize:num(8,40),supplierBalanceAfterSale:bool,transactionLimit:num(0,999999),managerPin:optText(80),pinOnDeleteLine:bool,fiscalEftposConfirm:bool,fiscalEftposDefault:z.enum(["NO","NONE","YES"]).optional(),prohibitRetailCustomerSale:bool
}).passthrough();
const backofficeSchema=z.object({
  activeShiftDisplay:z.enum(["USERNAME","OPERATOR_NAME"]).optional(),operatorPinLogin:bool,pinOnlyLogin:bool,newProductInitialQuantity:bool,onlineRetailBarcodeCheck:bool,autoWildcards:bool,newProductDiscountFields:bool,archiveLastPurchaseColumn:bool,archiveLastInventoryColumn:bool,archiveWarehouseCostColumn:bool,archiveRetailChangeColumn:bool,marginUsesAveragePurchase:bool,inventoryGroupSameBarcode:bool,leafletOnlyWithCustomerCard:bool,inventorySnapshotAfterFinalization:bool,inventoryImmediateNewProduct:bool,archiveAvgA:bool,archiveAvgB:bool,archiveDaysSinceLastSale:bool,storageAreasEnabled:bool,mandatoryInventorySnapshot:bool,activeShiftsOnly:bool,leafletExcelPriceIncludesVat:bool,syncBusinessUnits:bool,syncLeafletOffers:bool,syncOffersAndGifts:bool,barcodePrintDigits:num(0,20),averagePurchaseSource:z.enum(["INVOICES","PRODUCT"]).optional(),barcodeLabelPrice:z.enum(["NORMAL","LEAFLET"]).optional(),ean8ean13:bool,internalCodeUseSequence:bool,useInternalCode:bool,barcodeLabelCodeSource:z.enum(["SUPPLIER","INTERNAL"]).optional(),leafletPricePolicy:z.enum(["KEEP","UPDATE"]).optional()
}).passthrough();
const shiftsSchema=z.object({
  startEachShiftWithCash:bool,startCashAmount:num(0,999999),lockStartAmount:bool,forbidNewShiftIfOtherOpen:bool,includeOpeningEftposInCards:bool,warnIfOtherShiftOpen:bool,showShiftCashAtClose:bool,notifyShortage:bool,showShortageSurplus:bool,notifySurplus:bool,surplusMaxAmount:num(0,999999),showCashAnalysis:bool,printXNonFiscal:bool,printShiftClose:bool,createInventorySnapshotAtClose:bool,handoverOnlyCentralCashier:bool,lockOperatorWithoutBackup:bool,forbidCloseIfCashiersWaiting:bool
}).passthrough();
const customersSchema=z.object({
  pointsMode:z.enum(["TURNOVER","QUANTITY"]).optional(),turnoverPerPoint:num(0,999999),cardPrefix:optText(40),roundPoints:bool,showAlerts:bool,autoCardNumber:bool,redeemInMixedPayment:bool,redeemPoints:num(0,999999),redeemAmount:num(0,999999),turnoverCurrentPreviousYear:bool,printCustomerPointsFiscal:bool,loyaltyOnly:bool,printCustomerPointsNonFiscal:bool,promoPointsFirst:bool,thermalInvoicePriceIncludesVat:bool,customerPricingPrintBarcode:bool
}).passthrough();
const emailSchema=z.object({
  businessEmail:optText(220),ccEmails:optText(1000),responsibleEmail:optText(220),mailOnShiftStart:bool,mailOnShiftClose:bool,mailOnSaleListDelete:bool,closeMailIncludeCentralCash:bool,attachSalesXlsAfterClose:bool,invoicePdfToCustomer:bool,woltDeliveryEmail:optText(220)
}).passthrough();
const otherSchema=z.object({
  scaleType:optText(120),scaleComPort:optText(40),dataBits:num(5,8),stopBits:num(1,2),baudRate:num(0,1000000),parity:z.enum(["NONE","ODD","EVEN"]).optional(),labelValueFromSticker:bool,alwaysSellByWeight:bool,weightPrefix:optText(20),valuePrefix:optText(20),receiptMessage:optText(500),hotkeyFontSize:num(8,40),serialScannerPort:optText(40),eShopFolder:optText(500),productUrlPrefix:optText(500),mobileCardsDepartmentCode:optText(80),aadeUsername:optText(220),aadePassword:optText(500)
}).passthrough();
const purchasesSchema=z.object({
  emailHideTotal:bool,newOrderRowsAtEnd:bool,purchasePriceLatestSupplier:bool,excelHideWarehouseColumn:bool,updateWholesaleWhenRetailChanges:bool,excelHidePurchaseAndRetailColumns:bool,hideRestockWithoutOrder:bool,proposalDaysFrom:num(0,3650),proposalDaysTo:num(0,3650),averageSalesDaysA:num(1,3650),averageSalesDaysB:num(1,3650),showBarcodeFieldNewOrder:bool,scannerAddsQuantityOne:bool,requireInvoiceNumberNewOrder:bool
}).passthrough();
const schemas={business:businessSchema,banks:banksSchema,edelivery:edeliverySchema,pos:posSchema,backoffice:backofficeSchema,shifts:shiftsSchema,customers:customersSchema,email:emailSchema,other:otherSchema,purchases:purchasesSchema};

async function getRow(companyId){
  const rows=await prisma.$queryRaw`SELECT * FROM "ManagementParameters" WHERE "companyId"=${companyId} LIMIT 1`;
  if(rows[0])return rows[0];
  const id=uid();
  await prisma.$executeRaw`INSERT INTO "ManagementParameters" ("id","companyId") VALUES (${id},${companyId}) ON CONFLICT ("companyId") DO NOTHING`;
  return (await prisma.$queryRaw`SELECT * FROM "ManagementParameters" WHERE "companyId"=${companyId} LIMIT 1`)[0];
}
const mergeSection=(settings,section,value)=>({...settings,[section]:{...(settings?.[section]||{}),...value}});
const publicSecrets=row=>({woltPasswordConfigured:Boolean(row.woltPasswordEnc),efoodPasswordConfigured:Boolean(row.efoodPasswordEnc),aadePasswordConfigured:Boolean(row.aadePasswordEnc),managerPinConfigured:Boolean(row.managerPinEnc)});

router.get("/",async(req,res,next)=>{try{
  const companyId=req.user.companyId,row=await getRow(companyId);
  const company=await prisma.company.findUnique({where:{id:companyId},select:{id:true,name:true,taxId:true,city:true,email:true,phone:true}});
  if(!company)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});
  res.json({company,settings:row.settings||{},secrets:publicSecrets(row),integrations:{aade:"NOT_CONNECTED",edelivery:"NOT_CONNECTED",eftpos:"NOT_CONNECTED"}});
}catch(error){next(error)}});

router.patch("/:section",async(req,res,next)=>{try{
  const section=String(req.params.section||"");if(!sections.has(section))return res.status(404).json({error:"Άγνωστη ενότητα παραμέτρων."});
  const companyId=req.user.companyId,row=await getRow(companyId),parsed=schemas[section].parse(req.body||{}),payload={...parsed};
  let woltPasswordEnc=row.woltPasswordEnc,efoodPasswordEnc=row.efoodPasswordEnc,aadePasswordEnc=row.aadePasswordEnc,managerPinEnc=row.managerPinEnc;
  if(section==="edelivery"){
    if(payload.woltPassword){woltPasswordEnc=encrypt(payload.woltPassword)}delete payload.woltPassword;
    if(payload.efoodPassword){efoodPasswordEnc=encrypt(payload.efoodPassword)}delete payload.efoodPassword;
  }
  if(section==="pos"){
    if(payload.managerPin){managerPinEnc=encrypt(payload.managerPin)}delete payload.managerPin;
  }
  if(section==="other"){
    if(payload.aadePassword){aadePasswordEnc=encrypt(payload.aadePassword)}delete payload.aadePassword;
  }
  if(section==="business"){
    const companyData={};
    if(payload.name!==undefined)companyData.name=payload.name;
    for(const [key,value] of Object.entries({taxId:payload.taxId,city:payload.city,phone:payload.phone}))if(value!==undefined)companyData[key]=value||null;
    if(Object.keys(companyData).length)await prisma.company.update({where:{id:companyId},data:companyData});
  }
  if(section==="email"&&payload.businessEmail!==undefined)await prisma.company.update({where:{id:companyId},data:{email:payload.businessEmail||null}});
  const settings=mergeSection(row.settings||{},section,Object.fromEntries(Object.entries(payload).filter(([,v])=>v!==undefined)));
  await prisma.$executeRaw`UPDATE "ManagementParameters" SET "settings"=${JSON.stringify(settings)}::jsonb,"woltPasswordEnc"=${woltPasswordEnc},"efoodPasswordEnc"=${efoodPasswordEnc},"aadePasswordEnc"=${aadePasswordEnc},"managerPinEnc"=${managerPinEnc},"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
  await prisma.$executeRaw`INSERT INTO "ManagementParameterAudit" ("id","companyId","section","actorId","actorName") VALUES (${uid()},${companyId},${section},${req.user.id||null},${req.user.fullName||req.user.email||req.user.role||null})`;
  res.json({ok:true,secrets:publicSecrets({woltPasswordEnc,efoodPasswordEnc,aadePasswordEnc,managerPinEnc})});
}catch(error){next(error)}});

export default router;
