import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const LAB_IDS=Object.freeze({company:'whlab-company',controlCompany:'whlab-control-company',store:'whlab-store',siblingStore:'whlab-other-store',foreignStore:'whlab-control-store',owner:'whlab-owner',seller:'whlab-seller',unassigned:'whlab-unassigned',customer:'whlab-customer',otherCustomer:'whlab-other-customer',productA:'whlab-product-a',productB:'whlab-product-b',productZero:'whlab-product-zero',productPrivate:'whlab-product-private',productForeign:'whlab-product-foreign',site:'whlab-site',slug:'wholesale-lab'});
export const LAB_PRODUCTS=Object.freeze([
  {id:LAB_IDS.productA,name:'Δοκιμαστικός καφές κιβώτιο',sku:'WHLAB-A',unit:'BOX',vat:'24',price:'10',basis:'NET',stock:'100'},
  {id:LAB_IDS.productB,name:'Δοκιμαστικός χυμός',sku:'WHLAB-B',unit:'PIECE',vat:'13',price:'5.65',basis:'GROSS',stock:'80'},
  {id:LAB_IDS.productZero,name:'Δοκιμαστικό δείγμα',sku:'WHLAB-ZERO',unit:'PIECE',vat:'0',price:'0',basis:'NET',stock:'50'},
  {id:LAB_IDS.productPrivate,name:'Μη δημοσιευμένο δοκιμαστικό είδος',sku:'WHLAB-PRIVATE',unit:'PIECE',vat:'24',price:'7',basis:'NET',stock:'25'}
]);
export const LAB_STORES=Object.freeze([{id:LAB_IDS.store,name:'Εικονική χονδρική — δοκιμές'},{id:LAB_IDS.siblingStore,name:'Εικονικό κατάστημα ελέγχου'}]);
export const LAB_CUSTOMERS=Object.freeze([{id:LAB_IDS.customer,name:'Εικονικός πελάτης Α'},{id:LAB_IDS.otherCustomer,name:'Εικονικός πελάτης Β — χωρίς ανάθεση'}]);

export async function seedWholesaleLab(db,{assertIsolated}){
  await assertIsolated(db);
  // These are the actual wholesale dependency columns. No production startup,
  // fiscal, retail, payment, worker or provider bootstrap is invoked.
  for(const sql of [
    'CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"sku" TEXT,"unit" TEXT NOT NULL,"vatRate" NUMERIC(6,3) NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)',
    'CREATE TABLE "StoreProduct" ("id" TEXT PRIMARY KEY,"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"productId" TEXT NOT NULL REFERENCES "Product"("id"),"currentStock" NUMERIC(14,4) NOT NULL DEFAULT 0,"active" BOOLEAN NOT NULL DEFAULT true,UNIQUE("storeId","productId"))',
    'CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"storeId" TEXT,"total" NUMERIC(14,2) NOT NULL)',
    'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"quantity" NUMERIC(14,4) NOT NULL)',
    'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"storeId" TEXT,"amount" NUMERIC(14,2) NOT NULL)'
  ])await db.$executeRawUnsafe(sql);
  const roles={owner:{id:LAB_IDS.owner,role:'OWNER',name:'Εικονικός ιδιοκτήτης'},seller:{id:LAB_IDS.seller,role:'EMPLOYEE',name:'Εικονικός εξωτερικός πωλητής'},unassigned:{id:LAB_IDS.unassigned,role:'EMPLOYEE',name:'Εικονικός ανενεργός πωλητής'}};
  const credentials={};
  for(const [role,user] of Object.entries(roles)){
    const password=crypto.randomBytes(24).toString('base64url');
    credentials[role]={email:role+'@wholesale-lab.invalid',password};
    user.passwordHash=await bcrypt.hash(password,10);
  }
  const customerPassword=crypto.randomBytes(24).toString('base64url'),customerHash=await bcrypt.hash(customerPassword,10);
  const {ensureWholesalePortalSchema}=await import('../../server/src/wholesale-portal-bootstrap.js');
  const {ensureWholesaleSellerSchema}=await import('../../server/src/wholesale-seller-bootstrap.js');
  await db.$transaction(async tx=>{
    await assertIsolated(tx);
    for(const [id,name] of [[LAB_IDS.company,'MYWORKSTATION — ΕΙΚΟΝΙΚΗ ΧΟΝΔΡΙΚΗ'],[LAB_IDS.controlCompany,'ΕΙΚΟΝΙΚΟΣ ΞΕΧΩΡΙΣΤΟΣ ΕΤΑΙΡΙΚΟΣ ΕΛΕΓΧΟΣ']]){
      await tx.company.create({data:{id,name,active:true,licenseStatus:'ACTIVE',plan:'WHOLESALE_LAB',commercialNotes:'SYNTHETIC DISPOSABLE TEST DATA — NO FISCAL VALIDITY'}});
      await tx.companyModule.create({data:{id:id+'-module',companyId:id,moduleKey:'WHOLESALE_B2B',active:true}});
    }
    for(const store of LAB_STORES)await tx.store.create({data:{...store,companyId:LAB_IDS.company,cashCloseEmailEnabled:false}});
    await tx.store.create({data:{id:LAB_IDS.foreignStore,name:'Εικονικός ξένος έλεγχος',companyId:LAB_IDS.controlCompany,cashCloseEmailEnabled:false}});
    for(const [role,user] of Object.entries(roles))await tx.user.create({data:{id:user.id,email:credentials[role].email,passwordHash:user.passwordHash,fullName:user.name,role:user.role,companyId:LAB_IDS.company,mustChangePassword:false}});
    for(const product of LAB_PRODUCTS){
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","unit","vatRate") VALUES (${product.id},${LAB_IDS.company},${product.name},${product.sku},${product.unit},${product.vat}::numeric)`;
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES (${product.id+'-store'},${LAB_IDS.store},${product.id},${product.stock}::numeric)`;
    }
    await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES ('whlab-control-stock',${LAB_IDS.siblingStore},${LAB_IDS.productA},777)`;
    await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","unit","vatRate") VALUES (${LAB_IDS.productForeign},${LAB_IDS.controlCompany},'Εικονικό ξένο είδος','WHLAB-FOREIGN','PIECE',24)`;
    await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES ('whlab-foreign-stock',${LAB_IDS.foreignStore},${LAB_IDS.productForeign},999)`;
    await assertIsolated(tx);
  },{timeout:15000});
  await ensureWholesalePortalSchema(db);await ensureWholesaleSellerSchema(db);
  await db.$transaction(async tx=>{
    await assertIsolated(tx);
    for(const customer of LAB_CUSTOMERS){
      await tx.$executeRaw`INSERT INTO "WholesaleCustomer" ("id","companyId","code","name","creditLimit","paymentTermsDays") VALUES (${customer.id},${LAB_IDS.company},${customer.id},${customer.name},10000,30)`;
      const listId=customer.id+'-prices';
      await tx.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name") VALUES (${listId},${LAB_IDS.company},${customer.id},${'Εικονικός τιμοκατάλογος '+customer.name})`;
      await tx.$executeRaw`INSERT INTO "WholesaleCustomerPriceList" ("customerId","companyId","priceListId") VALUES (${customer.id},${LAB_IDS.company},${listId})`;
      for(const product of LAB_PRODUCTS){
        const price=customer.id===LAB_IDS.otherCustomer&&product.id===LAB_IDS.productA?'99':product.price;
        await tx.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","minimumQuantity","priceBasis") VALUES (${customer.id+'-'+product.id},${LAB_IDS.company},${listId},${product.id},${price}::numeric,1,${product.basis})`;
      }
      if(customer.id===LAB_IDS.customer)await tx.$executeRaw`INSERT INTO "WholesalePriceListProduct" ("id","companyId","priceListId","productId","unitPrice","minimumQuantity","priceBasis") VALUES ('whlab-tier-10',${LAB_IDS.company},${listId},${LAB_IDS.productA},9,10,'NET')`;
    }
    await tx.$executeRaw`INSERT INTO "WholesaleSellerMembership" ("id","companyId","userId","active") VALUES ('whlab-member',${LAB_IDS.company},${LAB_IDS.seller},true),('whlab-inactive-member',${LAB_IDS.company},${LAB_IDS.unassigned},false)`;
    await tx.$executeRaw`INSERT INTO "WholesaleSellerAssignment" ("id","companyId","userId","customerId","storeId") VALUES ('whlab-assignment',${LAB_IDS.company},${LAB_IDS.seller},${LAB_IDS.customer},${LAB_IDS.store})`;
    await tx.$executeRaw`INSERT INTO "WholesalePortalSite" ("id","companyId","slug","name","enabled") VALUES (${LAB_IDS.site},${LAB_IDS.company},${LAB_IDS.slug},'Εικονικό B2B — ΜΟΝΟ ΔΟΚΙΜΕΣ',true)`;
    await tx.$executeRaw`INSERT INTO "WholesalePortalAccount" ("id","siteId","companyId","customerId","storeId","login","passwordHash") VALUES ('whlab-account',${LAB_IDS.site},${LAB_IDS.company},${LAB_IDS.customer},${LAB_IDS.store},'whlab-customer',${customerHash})`;
    for(const product of LAB_PRODUCTS.filter(p=>p.id!==LAB_IDS.productPrivate))await tx.$executeRaw`INSERT INTO "WholesalePortalPublication" ("siteId","companyId","storeId","productId") VALUES (${LAB_IDS.site},${LAB_IDS.company},${LAB_IDS.store},${product.id})`;
    await assertIsolated(tx);
  },{timeout:15000});
  return Object.freeze({credentials,customer:{login:'whlab-customer',password:customerPassword}});
}
