import {requireStoreModule,isPlatformSuperAdmin} from '../middleware/module-access.js';
import {createInventoryCard} from './inventory-new-card.js';
import {readInventoryNewCardOptions} from './inventory-new-card-options.js';
import {lookupInventoryProductBarcode} from './inventory-product-barcode-lookup.js';

const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status})};
export function posNewProductAllowed(user,profile){
 if(user?.tokenType==='STORE_OPERATOR')return Boolean(profile&&profile.posAccess!==false&&profile.permissions?.newProduct===true);
 return user?.role==='OWNER'||isPlatformSuperAdmin(user);
}
export async function readPosNewProductAccess(db,user,storeId){
 if(!user?.companyId||!storeId||(user.storeId&&user.storeId!==storeId))fail('Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.');
 const store=await db.store.findFirst({where:{id:storeId,companyId:user.companyId,active:true},select:{id:true}});
 if(!store)fail('Δεν βρέθηκε ενεργό κατάστημα.',404);
 if(user.tokenType!=='STORE_OPERATOR'){
  if(!posNewProductAllowed(user))fail('Δεν έχεις δικαίωμα δημιουργίας νέου είδους.');
  return {terminalPos:user.terminalPos||'POS',actorName:user.fullName||null,employeeId:user.employeeId||null,onlineProductSearch:true};
 }
 const rows=await db.$queryRaw`SELECT c."employeeId",c."displayName",p."terminalPos",p."posAccess",p."permissions" FROM "StoreOperatorCredential" c JOIN "StoreOperatorProfile" p ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=${user.operatorId||user.id} AND c."companyId"=${user.companyId} AND c."storeId"=${storeId} AND c."active"=TRUE LIMIT 1`;
 const profile=rows[0];
 if(!posNewProductAllowed(user,profile))fail('Δεν έχεις δικαίωμα «Νέο είδος» από το BackOffice.');
 return {terminalPos:user.terminalPos||profile.terminalPos||'POS',actorName:profile.displayName,employeeId:profile.employeeId,onlineProductSearch:profile.permissions?.onlineBarcode===true};
}

export function registerPosNewProductRoutes(router,db,{inventoryModule=requireStoreModule('INVENTORY'),storeModule=requireStoreModule('STORE_MODE'),lookup=lookupInventoryProductBarcode}={}){
 const base='/stores/:storeId/new-product';
 const guard=async(req,res,next)=>{try{
  if(req.body?.storeId!==undefined&&req.body.storeId!==req.params.storeId)fail('Το κατάστημα της καρτέλας δεν συμφωνεί με το POS.');
  req.newProductContext=await readPosNewProductAccess(db,req.user,req.params.storeId);next();
 }catch(error){next(error)}};
 const current=async req=>readPosNewProductAccess(db,req.user,req.params.storeId);
 router.get(`${base}/options`,guard,storeModule,inventoryModule,async(req,res,next)=>{try{await current(req);res.set('Cache-Control','no-store');res.json(await readInventoryNewCardOptions(db,req.user,req.params.storeId))}catch(error){next(error)}});
 router.get(`${base}/barcode/:barcode`,guard,storeModule,inventoryModule,async(req,res,next)=>{try{
  const access=await current(req);if(!access.onlineProductSearch)fail('Δεν έχεις δικαίωμα Online αναζήτησης από το BackOffice.');
  res.set('Cache-Control','no-store');res.json(await lookup(db,req.user.companyId,String(req.params.barcode||'').trim()));
 }catch(error){next(error)}});
 router.post(base,guard,storeModule,inventoryModule,async(req,res,next)=>{try{
  const context=await current(req),result=await createInventoryCard(db,req.user,{...req.body,storeId:req.params.storeId},{origin:'POS',...context});
  res.status(result.idempotent?200:201).json({...result,storeId:req.params.storeId});
 }catch(error){if(error?.name==='ZodError')return res.status(400).json({error:'Ελέγξτε τα στοιχεία της νέας καρτέλας.',details:error.issues});next(error)}});
}
