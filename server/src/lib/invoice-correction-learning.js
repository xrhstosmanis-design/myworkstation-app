import {columnKey,inferConfirmedColumns,unitRelativeValues} from "./invoice-column-reading.js";

// Publishing a reusable platform profile is reserved for confirmed Super Admin
// corrections. Ordinary company corrections retain their tenant-local mapping.
export async function learnCentralInvoiceCorrection(tx,{actor,companyId,supplierId,line}){
  const superAdmin=actor?.role==="SUPER_ADMIN"||actor?.platformRole==="SUPER_ADMIN"||actor?.isSuperAdmin===true;
  if(!superAdmin||!supplierId)return {learned:false,scope:"COMPANY"};
  const suppliers=await tx.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
  const supplier=suppliers[0],taxId=String(supplier?.taxId||"").replace(/\D/g,""),code=String(line.supplierCode||"").trim();
  if(!/^\d{9}$/.test(taxId)||!code)return {learned:false,scope:"PLATFORM",reason:"SUPPLIER_TAX_ID_OR_ITEM_CODE_REQUIRED"};
  // Serialize first-time profile creation and concurrent corrections per supplier.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-profile:${taxId}`}))`;
  const rows=await tx.$queryRaw`SELECT "supplierKey","profile","profileVersion" FROM "InvoiceSupplierReadingProfile" WHERE "supplierTaxId"=${taxId} FOR UPDATE`;
  const current=rows[0],supplierKey=current?.supplierKey||taxId,profile=current?.profile||{};
  const raw=line.ocrRawText||line.rawText||"",columns=inferConfirmedColumns(raw,line),source=unitRelativeValues(raw);
  const readingRule={...(profile.readingRule||{})};
  if(columns){
    const signature=Object.keys(source.values).join(",");
    readingRule.confirmedColumnLayouts={...(readingRule.confirmedColumnLayouts||{}),[signature]:columns};
  }
  const mappingKey=columnKey(code),existing=profile.mappings?.[mappingKey]||{};
  // Only transferable product/pack identities are published. No company product
  // IDs, quantities, negotiated prices, invoice totals or attachments enter it.
  const mapping={...existing,supplierItemCode:code,description:String(line.description||""),
    invoiceUnit:line.invoiceUnit||"PIECE",stockUnit:"ΤΜΧ",unitsPerPackage:Math.max(1,Number(line.stockUnitsPerInvoiceUnit||1)),
    verified:true,source:"SUPER_ADMIN_LINE_CORRECTION"};
  // A generic POS product correction has no gram-unit editor. Retain the
  // explicit stock rule until the Super Admin changes that rule explicitly.
  if(existing.source==="SUPER_ADMIN_STOCK_RULE"){
    for(const key of ["invoiceUnit","stockUnit","unitsPerPackage","conversionFactor","stockConversion","source"])mapping[key]=existing[key];
  }
  const version=Number(current?.profileVersion||0)+1;
  const next={...profile,supplierTaxId:taxId,supplierName:supplier.name,central:true,profileVersion:version,
    readingRule,mappings:{...(profile.mappings||{}),[mappingKey]:mapping}};
  await tx.$executeRaw`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","profileVersion","profile","isActive","updatedByUserId","updatedAt") VALUES (${supplierKey},${taxId},${supplier.name},${columnKey(supplier.name)},${version},${JSON.stringify(next)}::jsonb,true,${actor.id||actor.userId||actor.sub||null},NOW()) ON CONFLICT ("supplierKey") DO UPDATE SET "profile"=EXCLUDED."profile","profileVersion"=EXCLUDED."profileVersion","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=NOW()`;
  return {learned:true,scope:"PLATFORM",supplierTaxId:taxId,profileVersion:version,columnsLearned:Boolean(columns)};
}
