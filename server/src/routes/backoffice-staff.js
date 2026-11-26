import {saveStaffAccountStatus} from "../services/backoffice-staff-account-status.js";
import {saveStaffCompanyVatDepartment,activateStaffCompanyVatDraft} from "../services/backoffice-staff-company-vat.js";
import {saveStaffDisplayName} from "../services/backoffice-staff-display-name.js";
import {renameStaffCompanyProduct} from "../services/backoffice-staff-product-rename.js";
import {createStaffPromotionDraft} from "../services/backoffice-staff-promotion-draft.js";
import {renameStaffWholesalePriceList} from "../services/backoffice-staff-wholesale-rename.js";
import {createStaffWholesalePriceListDraft} from "../services/backoffice-staff-wholesale-draft.js";
import {saveStaffCompanyCategory,reactivateStaffCompanyCategory} from "../services/backoffice-staff-company-taxonomy.js";
import {correctStaffSupplierTaxId} from '../services/backoffice-staff-supplier-tax-id.js';
import {updateStaffSupplierFiscal} from '../services/backoffice-staff-supplier-fiscal.js';
import {createStaffSupplierManually} from '../services/backoffice-staff-supplier-manual.js';
import {applyStaffSupplierAction} from '../services/backoffice-staff-supplier-actions.js';
import {ensureSupplierControlSchema} from './supplier-control.js';
import {mutateStaffSupplierRelatedRecord} from '../services/backoffice-staff-supplier-related-records.js';
import {updateStaffSupplierContact} from '../services/backoffice-staff-supplier-contact.js';
import {readFinalPassiveStore} from '../services/backoffice-staff-final-passive-store.js';
import {inventoryDetailQuery,personalInventoryDetailPage} from '../services/backoffice-staff-inventory-detail.js';
import {captureInventoryRead,verifyInventoryRead,personalInventoryLine} from '../services/backoffice-staff-inventory-read.js';
import {inventoryListCursor,personalInventoryListPage} from '../services/backoffice-staff-inventory-list.js';
import {Router} from 'express';
import {staffProfiles} from '../../../shared/backoffice-staff.mjs';
import {liveStaff,requireStaffGrant,staffError} from '../services/backoffice-staff-access.js';
import {listDelegatedStaffReads,changeDelegatedStaffRead} from '../services/backoffice-staff-read-delegation.js';
import {decodeStoredStaffCapabilities} from '../services/staff-pos-permission-ceiling.js';
import {authorizeStaffAdmin,createStaffAccount,updateStaffAccount,verifyStaffLogin} from '../services/backoffice-staff-accounts.js';
import {periodSchema} from '../services/cash-reconciliation-contract.js';
import {createCashReconciliationRepository} from '../services/cash-reconciliation-repository.js';
import {isBackofficeCompanyInstalled} from '../services/backoffice-company-profile.js';
import {companyAuthorityDescription,readStaffCompanyPolicy,readStaffCompanyDirectory} from '../services/backoffice-staff-company.js';

const failure=(res,error)=>{
  if(error?.name==='ZodError')return res.status(400).json({error:'Έλεγξε username, κωδικό, PIN και δικαιώματα.',code:'STAFF_INVALID_INPUT'});
  if(error?.code==='P2002'||error?.meta?.code==='23505')return res.status(409).json({error:'Δεν μπορεί να χρησιμοποιηθεί αυτό το username.',code:'STAFF_USERNAME_UNAVAILABLE'});
  const safe=error?.code?.startsWith('STAFF_')||['MODULE_DISABLED','LICENSE_INACTIVE'].includes(error?.code);
  return res.status(safe?error.status||403:503).json({error:safe?error.message:'Η λειτουργία δεν είναι διαθέσιμη. Ανανέωσε πριν επαναλάβεις ενέργεια.',code:safe?error.code:'STAFF_UNAVAILABLE'});
};
async function readRecentBankTransfers(db,companyId,storeId){
  try{
    const rows=await db.$queryRaw`
      SELECT t."id",t."occurredAt",t."amount",t."supplierName",t."type",
        CASE WHEN t."reversedAt" IS NOT NULL THEN 'CANCELLED'
          ELSE COALESCE(s."status",e."status") END AS "status",
        ARRAY(
          SELECT DISTINCT numbers."documentNumber"
          FROM (
            SELECT NULLIF(t."invoiceDocumentNumber",'') AS "documentNumber"
            UNION ALL
            SELECT NULLIF(d."documentNumber",'')
            FROM "SupplierPaymentAllocation" a
            JOIN "PurchaseDocument" d ON d."id"=a."purchaseDocumentId"
              AND d."companyId"=t."companyId" AND d."storeId"=t."storeId"
            WHERE a."settlementId"=s."id" AND a."companyId"=t."companyId"
          ) numbers
          WHERE numbers."documentNumber" IS NOT NULL
          ORDER BY numbers."documentNumber" LIMIT 50
        ) AS "documentNumbers"
      FROM "StoreTransaction" t
      LEFT JOIN "SupplierPaymentSettlement" s ON t."type"='SUPPLIER_PAYMENT'
        AND s."transactionId"=t."id" AND s."companyId"=t."companyId" AND s."storeId"=t."storeId"
      LEFT JOIN "OtherExpenseReview" e ON t."type"='OTHER_EXPENSE'
        AND e."transactionId"=t."id" AND e."companyId"=t."companyId" AND e."storeId"=t."storeId"
      WHERE t."companyId"=${companyId} AND t."storeId"=${storeId}
        AND t."paymentMethod"='BANK_TRANSFER' AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE')
      ORDER BY t."occurredAt" DESC,t."id" DESC LIMIT 50
    `;
    return rows.map(row=>({...row,amount:Number(row.amount)}));
  }catch(error){
    // Payment ledger compatibility tables can be created lazily by the canonical writers.
    // Do not bootstrap them from this read or present an unavailable ledger as empty.
    if(error?.code==='P2010'&&['42P01','42703'].includes(error?.meta?.code))return null;
    throw error;
  }
}
export function createBackofficeStaffRouter({db,authenticate,issueSession,repository=createCashReconciliationRepository(db),readCompanyDirectory=readStaffCompanyDirectory}){
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next()});
  router.post('/login',async(req,res)=>{try{
    const result=await verifyStaffLogin(db,req.body,req.ip,process.env.JWT_SECRET,async(tx,user)=>{
      const session=await issueSession(user,req,'Προσωπικό BackOffice',tx);
      await tx.authAudit.create({data:{userId:user.id,email:user.email,event:'STAFF_LOGIN_SUCCESS',success:true,deviceName:'Προσωπικό BackOffice'}});
      return session;
    });
    if(!result.ok)return res.status(result.limited?429:401).json({error:result.limited?'Πολλές προσπάθειες. Δοκίμασε ξανά σε 15 λεπτά.':'Λανθασμένο username ή κωδικός/PIN.',code:result.limited?'STAFF_LOGIN_LIMIT':'STAFF_LOGIN_REJECTED'});
    res.json(result.session);
  }catch(error){failure(res,error)}});
  router.use(authenticate);
  router.post("/company/product-renames",async(req,res)=>{
    try{res.json(await renameStaffCompanyProduct(db,req))}catch(error){failure(res,error)}
  });
  router.post("/company/promotion-drafts",async(req,res)=>{
    try{res.status(201).json(await createStaffPromotionDraft(db,req))}catch(error){failure(res,error)}
  });
  router.post("/company/wholesale-config/price-list-renames",async(req,res)=>{
    try{res.json(await renameStaffWholesalePriceList(db,req))}catch(error){failure(res,error)}
  });
  router.post("/company/wholesale-config/price-list-drafts",async(req,res)=>{
    try{res.status(201).json(await createStaffWholesalePriceListDraft(db,req))}catch(error){failure(res,error)}
  });
  router.post(['/company/taxonomy/categories/:id/reactivate','/company/taxonomy/subcategories/:id/reactivate'],async(req,res)=>{
    try{res.json(await reactivateStaffCompanyCategory(db,req))}catch(error){failure(res,error)}
  });

  router.post('/company/taxonomy/vat-departments',async(req,res)=>{
    try{res.status(201).json(await saveStaffCompanyVatDepartment(db,req))}catch(error){failure(res,error)}
  });
  router.post('/company/taxonomy/vat-departments/:id/activate-draft',async(req,res)=>{
    try{res.json(await activateStaffCompanyVatDraft(db,req))}catch(error){failure(res,error)}
  });
  router.patch('/company/taxonomy/vat-departments/:id',async(req,res)=>{
    try{res.json(await saveStaffCompanyVatDepartment(db,req))}catch(error){failure(res,error)}
  });

  router.patch('/company/staff-account-status/:id',async(req,res)=>{
    try{res.json(await saveStaffAccountStatus(db,req))}catch(error){failure(res,error)}
  });
  router.patch('/company/staff-display-names/:id',async(req,res)=>{
    try{res.json(await saveStaffDisplayName(db,req))}catch(error){failure(res,error)}
  });
  router.post(['/company/taxonomy/categories','/company/taxonomy/subcategories'],async(req,res)=>{
    try{res.status(201).json(await saveStaffCompanyCategory(db,req))}catch(error){failure(res,error)}
  });
  router.patch(['/company/taxonomy/categories/:id','/company/taxonomy/subcategories/:id'],async(req,res)=>{
    try{res.json(await saveStaffCompanyCategory(db,req))}catch(error){failure(res,error)}
  });

  router.get(['/company/passive/staff-policy', '/company/passive/category-products', '/company/passive/vat-departments/:id/products', '/company/passive/product-companies/:id/products', '/company/passive/product-movements/:id', '/company/passive/audit-context/:sourceType/:id', '/company/passive/audit-online'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  router.get(['/passive/stores/:storeId/employees', '/passive/stores/:storeId/schedules', '/passive/stores/:storeId/evaluations/:id', '/passive/stores/:storeId/performance/:id', '/passive/stores/:storeId/validation/:id', '/passive/stores/:storeId/operators', '/passive/stores/:storeId/cloud', '/passive/stores/:storeId/proofs', '/passive/stores/:storeId/proofs/:id', '/passive/stores/:storeId/pending-sources','/passive/stores/:storeId/cash-daily-summary','/passive/stores/:storeId/cash-investigation/:id','/passive/stores/:storeId/barcode-price-requests','/passive/stores/:storeId/barcode-sales'],async(req,res)=>{try{res.json(await readFinalPassiveStore(db,req))}catch(error){failure(res,error)}});
  router.get(['/company/product-center/catalog', '/company/product-center/set-options', '/company/product-center/package-options', '/company/product-center/audience-discounts', '/company/product-center/price-catalog', '/company/product-center/customer-wholesale-prices', '/company/product-center/products/:productId/card', '/company/product-center/products/:productId/barcodes', '/company/product-center/products/:productId/details', '/company/product-center/products/:productId/set', '/company/product-center/products/:productId/stock-package', '/company/product-center/products/:productId/delivery', '/company/product-center/products/:productId/price-history', '/company/product-center/products/:productId/purchases'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  router.get(['/company/operations-status/stores','/company/operations-status/observer-status','/company/operations-status/observer-events','/company/operations-status/readiness','/company/operations-status/dispatch-notes','/company/operations-status/dispatch-notes/:id','/company/operations-status/outbox'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  router.get(['/company/wholesale-config/customers', '/company/wholesale-config/price-lists', '/company/wholesale-config/price-lists/:id/products', '/company/wholesale-config/site', '/company/wholesale-config/portal-accounts', '/company/wholesale-config/publications', '/company/wholesale-config/sellers', '/company/wholesale-config/sellers/:id/assignments', '/company/wholesale-config/stores'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  router.get(['/company/party-control/suppliers', '/company/party-control/supplier-balances', '/company/party-control/supplier-sales', '/company/party-control/suppliers/:partyId/card', '/company/party-control/suppliers/:partyId/ledger', '/company/party-control/suppliers/:partyId/sales', '/company/party-control/suppliers/:partyId/catalog', '/company/party-control/customers', '/company/party-control/customers/:partyId/card', '/company/party-control/customers/:partyId/ledger', '/company/party-control/customers/:partyId/loyalty', '/company/party-control/customers/:partyId/work-card-status', '/company/party-control/customer-receipts', '/company/party-control/customer-fiscal-status'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  for(const resource of ['addresses','units']){
    const path='/company/party-control/suppliers/:partyId/'+resource;
    router.post(path,async(req,res)=>{try{res.status(201).json(await mutateStaffSupplierRelatedRecord(db,req))}catch(error){failure(res,error)}});
    router.delete(path+'/:itemId',async(req,res)=>{try{res.json(await mutateStaffSupplierRelatedRecord(db,req))}catch(error){failure(res,error)}});
  }
  router.post('/company/party-control/suppliers',async(req,res)=>{try{
    const result=await createStaffSupplierManually(db,req);
    res.status(result.replay?200:201).json(result);
  }catch(error){failure(res,error)}});
  router.patch('/company/party-control/suppliers/:partyId/fiscal',async(req,res)=>{try{res.json(await updateStaffSupplierFiscal(db,req))}catch(error){failure(res,error)}});
  router.patch('/company/party-control/suppliers/:partyId/tax-id',async(req,res)=>{try{res.json(await correctStaffSupplierTaxId(db,req))}catch(error){failure(res,error)}});
  router.patch('/company/party-control/suppliers/:partyId/contact',async(req,res)=>{try{res.json(await updateStaffSupplierContact(db,req))}catch(error){failure(res,error)}});
  router.post('/company/party-control/suppliers/:partyId/balance-adjustments',async(req,res)=>{
    try{
      if(req.staffCompanyGrant?.capability==='supplier-balance.adjust')await ensureSupplierControlSchema();
      res.status(201).json(await applyStaffSupplierAction(db,req));
    }catch(error){failure(res,error)}
  });
  router.post(['/company/party-control/suppliers/:partyId/deactivate','/company/party-control/suppliers/:partyId/reactivate'],async(req,res)=>{
    try{res.json(await applyStaffSupplierAction(db,req))}catch(error){failure(res,error)}
  });
  router.get(['/company/owner-reports/dashboard','/company/owner-reports/master-catalog','/company/owner-reports/financial-stores','/company/owner-reports/financial-suppliers','/company/owner-reports/shifts','/company/owner-reports/shifts/:sessionId/detail','/company/owner-reports/payments','/company/owner-reports/business-picture','/company/owner-reports/audit'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  // These exact company reads terminate here after the router's one authentication.
  router.get(['/company/configuration/pos-terminals','/company/configuration/modifiers/groups','/company/configuration/modifiers/groups/:groupId/items','/company/configuration/modifiers/groups/:groupId/inventory-prices','/company/configuration/preparation/catalog','/company/configuration/preparation/products/:productId','/company/configuration/preparation/modifiers/:modifierId/consumption','/company/configuration/license','/company/configuration/parameters/business','/company/configuration/parameters/banks','/company/configuration/parameters/edelivery','/company/configuration/parameters/pos','/company/configuration/parameters/backoffice','/company/configuration/parameters/shifts','/company/configuration/parameters/customers','/company/configuration/parameters/email','/company/configuration/parameters/other','/company/configuration/parameters/purchases'],async(req,res)=>{try{res.json(await readCompanyDirectory(db,req))}catch(error){failure(res,error)}});
 router.get('/company/workforce-roles',async(req,res)=>{try{res.json(await readStaffCompanyDirectory(db,req))}catch(error){failure(res,error)}});
  router.get('/me',async(req,res)=>{try{
    const account=await liveStaff(db,req.user);
    const companyInstalled=await isBackofficeCompanyInstalled(db);
    const companyCapabilities=companyInstalled?await readStaffCompanyPolicy(db,account.userId,account.companyId):undefined;
    const stores=await db.$queryRaw`SELECT s."id",s."name",g."profile",g."capabilities",g."revision" FROM "BackofficeStaffGrant" g JOIN "Store" s ON s."id"=g."storeId" AND s."companyId"=g."companyId" WHERE g."userId"=${req.user.id} AND g."companyId"=${req.user.companyId} AND g."active"=true AND s."active"=true ORDER BY s."name" LIMIT 101`;
    if(stores.length>100)throw staffError(503,'STAFF_LIMIT','Υπάρχουν περισσότερα καταστήματα από το επιτρεπόμενο όριο.');
    const after=await liveStaff(db,req.user);
    if(after.revision!==account.revision)throw staffError();
    if(companyInstalled&&!await isBackofficeCompanyInstalled(db))throw staffError(503,'STAFF_COMPANY_UNAVAILABLE');
    res.json({userId:account.userId,companyId:account.companyId,username:account.username,fullName:account.fullName,stores:stores.map(store=>({...store,capabilities:decodeStoredStaffCapabilities(store.capabilities).capabilities})),...(companyInstalled?{revision:account.revision,companyAuthority:companyAuthorityDescription(),companyCapabilities}:{})});
  }catch(error){failure(res,error)}});
  router.get('/stores/:storeId/delegated-reads',async(req,res)=>{try{
    const result=await listDelegatedStaffReads(db,req,req.params.storeId);
    res.set("Cache-Control","private, no-store").json(result);
  }catch(error){failure(res,error)}});
  router.patch('/stores/:storeId/delegated-reads/:userId',async(req,res)=>{try{
    res.json(await changeDelegatedStaffRead(db,req,req.params.storeId,req.params.userId));
  }catch(error){failure(res,error)}});
  router.get('/admin',async(req,res)=>{try{
    const actor=await authorizeStaffAdmin(db,req.user);
    const companyInstalled=actor.role==='OWNER'&&await isBackofficeCompanyInstalled(db);
    const accounts=await db.$queryRaw`SELECT a."userId" AS "id",a."username",a."active",a."revision",u."fullName" FROM "BackofficeStaffAccount" a JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId" WHERE a."companyId"=${req.user.companyId} ORDER BY u."fullName" LIMIT 501`;
    const grants=await db.$queryRaw`SELECT "userId","storeId","profile","capabilities","active","revision" FROM "BackofficeStaffGrant" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "userId","storeId" LIMIT 50001`;
    const canEditPosPermissionCeiling=actor.role==='OWNER';
    const visibleGrants=grants.map(grant=>{
      const {capabilities,posPermissionCeiling,backofficeReadDelegationCeiling}=decodeStoredStaffCapabilities(grant.capabilities);
      return {...grant,capabilities,...(canEditPosPermissionCeiling?{posPermissionCeiling,backofficeReadDelegationCeiling}:{})};
    });
    const companyPolicies=companyInstalled?await db.$queryRaw`SELECT "userId","companyCapabilities","revision" FROM "BackofficeStaffAccount" WHERE "companyId"=${req.user.companyId} ORDER BY "userId" LIMIT 501`:[];
    if(accounts.length>500||grants.length>50000)throw staffError(503,'STAFF_LIMIT');
    const stores=await db.store.findMany({where:{companyId:req.user.companyId,active:true},select:{id:true,name:true},orderBy:{name:'asc'},take:101});
    if(stores.length>100)throw staffError(503,'STAFF_LIMIT');
    await authorizeStaffAdmin(db,req.user);
    if(companyInstalled&&(!await isBackofficeCompanyInstalled(db)||companyPolicies.length!==accounts.length||accounts.some(a=>!companyPolicies.some(p=>p.userId===a.id&&p.revision===a.revision))))throw staffError(409,'STAFF_STALE');
    res.json({companyId:req.user.companyId,canEditPosPermissionCeiling,canEditBackofficeReadDelegationCeiling:canEditPosPermissionCeiling,accounts:accounts.map(a=>({...a,grants:visibleGrants.filter(g=>g.userId===a.id),...(companyInstalled?{companyCapabilities:companyPolicies.find(p=>p.userId===a.id).companyCapabilities}:{})})),stores,profiles:staffProfiles,...(companyInstalled?{companyAuthority:companyAuthorityDescription()}:{})});
  }catch(error){failure(res,error)}});
  router.post('/admin/accounts',async(req,res)=>{try{res.status(201).json(await createStaffAccount(db,req.user,req.body))}catch(error){failure(res,error)}});
  router.put('/admin/accounts/:userId',async(req,res)=>{try{res.json(await updateStaffAccount(db,req.user,req.params.userId,req.body))}catch(error){failure(res,error)}});
  for(const [section,capability] of [['sales','sales.read'],['shifts','shifts.close']])router.get(`/${section}/stores/:storeId/terminals`,async(req,res)=>{try{
    const {storeId}=req.params;if(storeId!==req.user.storeId)throw staffError();
    await requireStaffGrant(db,req.user,storeId,capability);
    const rows=await db.$queryRaw`SELECT DISTINCT "terminalPos" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} ORDER BY "terminalPos" LIMIT 101`;
    if(rows.length>100)throw staffError(503,'STAFF_LIMIT');
    await requireStaffGrant(db,req.user,storeId,capability);
    res.json({storeId,terminals:[...new Set(['MAIN',...rows.map(row=>row.terminalPos).filter(Boolean)])]});
  }catch(error){failure(res,error)}});
  router.get('/payments/stores/:storeId',async(req,res)=>{try{
    const {storeId}=req.params;if(storeId!==req.user.storeId)throw staffError();
    await requireStaffGrant(db,req.user,storeId,'payments.read');
    const suppliers=await db.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name" LIMIT 2001`;
    const purchaseDocuments=await db.$queryRaw`SELECT "id","supplierId","documentNumber","documentDate","totalGross","status" FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "status" IN ('DRAFT','APPROVED') ORDER BY "documentDate" DESC,"id" LIMIT 500`;
    if(suppliers.length>2000)throw staffError(503,'STAFF_LIMIT');
    const recentBankTransfers=await readRecentBankTransfers(db,req.user.companyId,storeId);
    await requireStaffGrant(db,req.user,storeId,'payments.read');
    res.json({storeId,suppliers,purchaseDocuments:purchaseDocuments.map(row=>({...row,totalGross:Number(row.totalGross)})),recentBankTransfers});
  }catch(error){failure(res,error)}});
  router.get('/inventory/stores/:storeId/stocktakes',async(req,res)=>{try{
    const {storeId}=req.params;
    if(req.user.storeId!==storeId)throw staffError();
    const read=await captureInventoryRead(db,req.user,storeId);
    const page=await personalInventoryListPage(db,req.user,storeId,read.visibility.history,inventoryListCursor(req.query));
    await verifyInventoryRead(db,req.user,storeId,read);
    res.json({storeId,...page});
  }catch(error){failure(res,error)}});
  router.get('/inventory/stores/:storeId/stocktakes/:stocktakeId',async(req,res)=>{try{
    const {storeId,stocktakeId}=req.params;
    if(req.user.storeId!==storeId)throw staffError();
    const read=await captureInventoryRead(db,req.user,storeId);
    const canReadFinalized=read.visibility.history||read.visibility.finalizer;
    const stocktake=(await db.$queryRaw`SELECT "id","name","status","scopeType","finalizedAt" FROM "Stocktake" WHERE "id"=${stocktakeId} AND "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "inventoryVersion"=2 AND ("status"='DRAFT' OR (${canReadFinalized} AND "status"='FINALIZED')) LIMIT 1`)[0];
    if(!stocktake)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε διαθέσιμη απογραφή στο κατάστημα.');
    const onlyCounted=stocktake.scopeType==='FREE'&&stocktake.status==='FINALIZED';
    const query=inventoryDetailQuery(req.query);
    if(query){
      const page=await personalInventoryDetailPage(db,req.user,stocktakeId,onlyCounted,read.visibility.expected,query);
      await verifyInventoryRead(db,req.user,storeId,read);
      return res.json({storeId,id:stocktake.id,name:stocktake.name,status:stocktake.status,scopeType:stocktake.scopeType,finalizedAt:stocktake.finalizedAt,...page});
    }
    const lines=await db.$queryRaw`SELECT sl."id",sl."productId",p."name",p."sku",sl."expectedQuantity",sl."countedQuantity",sl."countVersion",sl."recountRequired",COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."createdAt") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${req.user.companyId} WHERE sl."stocktakeId"=${stocktakeId} AND (${onlyCounted}=false OR sl."countedQuantity" IS NOT NULL) ORDER BY p."name",sl."id" LIMIT 10001`;
    if(lines.length>10000)throw staffError(503,'STAFF_LIMIT','Η απογραφή υπερβαίνει το όριο της προσωπικής προβολής.');
    await verifyInventoryRead(db,req.user,storeId,read);
    res.json({storeId,id:stocktake.id,name:stocktake.name,status:stocktake.status,scopeType:stocktake.scopeType,finalizedAt:stocktake.finalizedAt,lines:lines.map(line=>personalInventoryLine(line,read.visibility.expected))});
  }catch(error){failure(res,error)}});
  router.get('/cash/stores/:storeId',async(req,res)=>{try{
    const {storeId}=req.params,period=periodSchema.parse({from:req.query.from,to:req.query.to});
    if(req.user.storeId!==storeId)throw staffError();
    await requireStaffGrant(db,req.user,storeId,'cash.read');
    const scope={companyId:req.user.companyId,storeId};scope.generation=await repository.generation(scope);
    const result=await repository.read(scope,period);
    await requireStaffGrant(db,req.user,storeId,'cash.read');
    if(await repository.generation(scope)!==scope.generation)throw staffError(409,'STAFF_SOURCE_CHANGED','Άλλαξε το κατάστημα. Ανανέωσε την αναφορά.');
    res.json(result);
  }catch(error){failure(res,error)}});
  return router;
}
