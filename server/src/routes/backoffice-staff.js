import {Router} from 'express';
import {staffProfiles} from '../../../shared/backoffice-staff.mjs';
import {liveStaff,requireStaffGrant,staffError} from '../services/backoffice-staff-access.js';
import {authorizeStaffAdmin,createStaffAccount,updateStaffAccount,verifyStaffLogin} from '../services/backoffice-staff-accounts.js';
import {periodSchema} from '../services/cash-reconciliation-contract.js';
import {createCashReconciliationRepository} from '../services/cash-reconciliation-repository.js';

const failure=(res,error)=>{
  if(error?.name==='ZodError')return res.status(400).json({error:'Έλεγξε username, κωδικό, PIN και δικαιώματα.',code:'STAFF_INVALID_INPUT'});
  if(error?.code==='P2002'||error?.meta?.code==='23505')return res.status(409).json({error:'Δεν μπορεί να χρησιμοποιηθεί αυτό το username.',code:'STAFF_USERNAME_UNAVAILABLE'});
  const safe=error?.code?.startsWith('STAFF_')||['MODULE_DISABLED','LICENSE_INACTIVE'].includes(error?.code);
  return res.status(safe?error.status||403:503).json({error:safe?error.message:'Η λειτουργία δεν είναι διαθέσιμη. Ανανέωσε πριν επαναλάβεις ενέργεια.',code:safe?error.code:'STAFF_UNAVAILABLE'});
};
export function createBackofficeStaffRouter({db,authenticate,issueSession,repository=createCashReconciliationRepository(db)}){
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
  router.get('/me',async(req,res)=>{try{
    const account=await liveStaff(db,req.user);
    const stores=await db.$queryRaw`SELECT s."id",s."name",g."profile",g."capabilities",g."revision" FROM "BackofficeStaffGrant" g JOIN "Store" s ON s."id"=g."storeId" AND s."companyId"=g."companyId" WHERE g."userId"=${req.user.id} AND g."companyId"=${req.user.companyId} AND g."active"=true AND s."active"=true ORDER BY s."name" LIMIT 101`;
    if(stores.length>100)throw staffError(503,'STAFF_LIMIT','Υπάρχουν περισσότερα καταστήματα από το επιτρεπόμενο όριο.');
    await liveStaff(db,req.user);
    res.json({userId:account.userId,companyId:account.companyId,username:account.username,fullName:account.fullName,stores});
  }catch(error){failure(res,error)}});
  router.get('/admin',async(req,res)=>{try{
    await authorizeStaffAdmin(db,req.user);
    const accounts=await db.$queryRaw`SELECT a."userId" AS "id",a."username",a."active",a."revision",u."fullName" FROM "BackofficeStaffAccount" a JOIN "User" u ON u."id"=a."userId" AND u."companyId"=a."companyId" WHERE a."companyId"=${req.user.companyId} ORDER BY u."fullName" LIMIT 501`;
    const grants=await db.$queryRaw`SELECT "userId","storeId","profile","capabilities","active","revision" FROM "BackofficeStaffGrant" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "userId","storeId" LIMIT 50001`;
    if(accounts.length>500||grants.length>50000)throw staffError(503,'STAFF_LIMIT');
    const stores=await db.store.findMany({where:{companyId:req.user.companyId,active:true},select:{id:true,name:true},orderBy:{name:'asc'},take:101});
    if(stores.length>100)throw staffError(503,'STAFF_LIMIT');
    await authorizeStaffAdmin(db,req.user);
    res.json({companyId:req.user.companyId,accounts:accounts.map(a=>({...a,grants:grants.filter(g=>g.userId===a.id)})),stores,profiles:staffProfiles});
  }catch(error){failure(res,error)}});
  router.post('/admin/accounts',async(req,res)=>{try{res.status(201).json(await createStaffAccount(db,req.user,req.body))}catch(error){failure(res,error)}});
  router.put('/admin/accounts/:userId',async(req,res)=>{try{res.json(await updateStaffAccount(db,req.user,req.params.userId,req.body))}catch(error){failure(res,error)}});
  router.get('/sales/stores/:storeId/terminals',async(req,res)=>{try{
    const {storeId}=req.params;if(storeId!==req.user.storeId)throw staffError();
    await requireStaffGrant(db,req.user,storeId,'sales.read');
    const rows=await db.$queryRaw`SELECT DISTINCT "terminalPos" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} ORDER BY "terminalPos" LIMIT 101`;
    if(rows.length>100)throw staffError(503,'STAFF_LIMIT');
    await requireStaffGrant(db,req.user,storeId,'sales.read');
    res.json({storeId,terminals:[...new Set(['MAIN',...rows.map(row=>row.terminalPos).filter(Boolean)])]});
  }catch(error){failure(res,error)}});
  router.get('/payments/stores/:storeId',async(req,res)=>{try{
    const {storeId}=req.params;if(storeId!==req.user.storeId)throw staffError();
    await requireStaffGrant(db,req.user,storeId,'payments.read');
    const suppliers=await db.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name" LIMIT 2001`;
    const purchaseDocuments=await db.$queryRaw`SELECT "id","supplierId","documentNumber","documentDate","totalGross","status" FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "status" IN ('DRAFT','APPROVED') ORDER BY "documentDate" DESC,"id" LIMIT 500`;
    if(suppliers.length>2000)throw staffError(503,'STAFF_LIMIT');
    await requireStaffGrant(db,req.user,storeId,'payments.read');
    res.json({storeId,suppliers,purchaseDocuments:purchaseDocuments.map(row=>({...row,totalGross:Number(row.totalGross)}))});
  }catch(error){failure(res,error)}});
  router.get('/inventory/stores/:storeId/stocktakes',async(req,res)=>{try{
    const {storeId}=req.params;
    if(req.user.storeId!==storeId)throw staffError();
    await requireStaffGrant(db,req.user,storeId,'inventory.read');
    const rows=await db.$queryRaw`SELECT "id","name","status","startedAt" FROM "Stocktake" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "inventoryVersion"=2 AND "status"='DRAFT' ORDER BY "startedAt" DESC LIMIT 201`;
    if(rows.length>200)throw staffError(503,'STAFF_LIMIT','Οι ανοιχτές απογραφές υπερβαίνουν το όριο.');
    await requireStaffGrant(db,req.user,storeId,'inventory.read');
    res.json({storeId,stocktakes:rows});
  }catch(error){failure(res,error)}});
  router.get('/inventory/stores/:storeId/stocktakes/:stocktakeId',async(req,res)=>{try{
    const {storeId,stocktakeId}=req.params;
    if(req.user.storeId!==storeId)throw staffError();
    const {grant}=await requireStaffGrant(db,req.user,storeId,'inventory.read');
    const canFinalize=grant.capabilities.includes('inventory.finalize');
    const stocktake=(await db.$queryRaw`SELECT "id","name","status","finalizedAt" FROM "Stocktake" WHERE "id"=${stocktakeId} AND "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "inventoryVersion"=2 AND ("status"='DRAFT' OR (${canFinalize} AND "status"='FINALIZED')) LIMIT 1`)[0];
    if(!stocktake)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε ανοιχτή απογραφή στο κατάστημα.');
    const lines=await db.$queryRaw`SELECT sl."id",sl."productId",p."name",p."sku",sl."expectedQuantity",sl."countedQuantity",sl."countVersion",sl."recountRequired",COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."createdAt") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${req.user.companyId} WHERE sl."stocktakeId"=${stocktakeId} ORDER BY p."name",sl."id" LIMIT 10001`;
    if(lines.length>10000)throw staffError(503,'STAFF_LIMIT','Η απογραφή υπερβαίνει το όριο της προσωπικής προβολής.');
    const {grant:latest}=await requireStaffGrant(db,req.user,storeId,'inventory.read');
    const exposeFinalization=canFinalize&&latest.capabilities.includes('inventory.finalize');
    if(stocktake.status==='FINALIZED'&&!exposeFinalization)throw staffError();
    res.json({storeId,...stocktake,lines:lines.map(l=>{const {expectedQuantity,...visible}=l;return {...visible,countedQuantity:l.countedQuantity===null?null:String(l.countedQuantity),...(exposeFinalization?{expectedQuantity:String(expectedQuantity)}:{})}})});
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
