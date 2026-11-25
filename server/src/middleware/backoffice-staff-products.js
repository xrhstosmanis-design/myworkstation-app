import {saveStaffStoreProductPrice,staffStoreProductPriceCapability,staffStoreProductPricePath} from "../services/staff-store-product-price.js";
import {staffRequestCapability} from '../../../shared/backoffice-staff.mjs';
import {Router} from 'express';
import {createOwnerProductsRouter} from '../routes/owner-products.js';
import {createOwnerProductCompositionsRouter} from '../routes/owner-product-compositions.js';
import {createOwnerProductActionsRouter} from '../routes/owner-product-actions.js';
import {inventoryTransactionDb,invokeInventoryRouter} from '../routes/pos-operator-inventory.js';
import {assertInventoryObjects,assertInventoryPayload} from '../services/pos-inventory-access.js';
import {requireStaffAction,staffError} from '../services/backoffice-staff-access.js';
import {prisma} from '../prisma.js';
import {createInventoryCard} from '../lib/inventory-new-card.js';
import {readInventoryNewCardOptions} from '../lib/inventory-new-card-options.js';

// Owner product mounts precede the canonical action router. Finish only these
// exact delegated actions before any owner-wide bootstrap/audit middleware.
// auth has already bound the real store and checked the exact live capability;
// both canonical services recheck current grant/session/licence themselves.
export function createStaffProductBridge(db){
  return async(req,res,next)=>{
    if(req.user?.staffAccess===true&&req.staffGrant?.capability===staffStoreProductPriceCapability){
      try{
        const match=staffStoreProductPricePath.exec(req.path);
        if(req.method!=='PATCH'||!match)throw staffError();
        return res.json(await saveStaffStoreProductPrice(db,req,decodeURIComponent(match[1])));
      }catch(error){
        if(error?.name==='ZodError'||error instanceof URIError)return res.status(400).json({error:'Έλεγξε την τιμή και το κατάστημα.'});
        return next(error);
      }
    }
    if(req.user?.staffAccess===true&&req.staffGrant?.capability==='products.edit'){
      try{
        const {companyId,storeId}=req.user;
        const scope={kind:'STAFF_PRODUCT_CARD',companyId,storeId,schemaReady:true,capabilities:{edit:true,prices:true,barcodes:true}};
        const path=req.path;
        if(staffRequestCapability(req.method,`/api/owner-products${path}`)!=='products.edit')throw staffError();
        const productId=path==='/catalog'?null:decodeURIComponent(path.split('/')[1]);
        if(path==='/catalog'&&!req.query.productId)return res.status(400).json({error:'Επίλεξε είδος.'});
        const write=req.method!=='GET';
        const composition=/\/(?:composition|set-items|recipe-items)(?:\/|$)/.test(path);
        const stock=path.endsWith('/stock-adjustment');
        const result=await db.$transaction(async raw=>{
          const tx=inventoryTransactionDb(raw);
          await requireStaffAction(tx,req,storeId,'products.edit');
          assertInventoryPayload(scope,{kind:'staff-card'},req.query,req.body);
          if(stock&&(req.body?.storeId!==storeId||req.body?.mode!=='SET'||req.body?.logMovement!==true))throw staffError();
          if(productId)await assertInventoryObjects(tx,scope,[...new Set([productId,req.body?.relatedProductId,req.body?.ingredientProductId].filter(Boolean))],{lock:write});
          const delegated=Router();
          const factory=composition?createOwnerProductCompositionsRouter:stock?createOwnerProductActionsRouter:createOwnerProductsRouter;
          delegated.use(factory({db:tx,scope}));
          const child=Object.create(req);
          child.url=req.url;child.originalUrl=req.originalUrl;child.baseUrl=req.baseUrl;child.params={};
          return invokeInventoryRouter(delegated,child);
        },{isolationLevel:'Serializable'});
        return res.status(result.status).json(result.data);
      }catch(error){
        if(error.inventoryResponse)return res.status(error.inventoryResponse.status).json(error.inventoryResponse.data);
        return next(error);
      }
    }
    if(req.user?.staffAccess!==true||req.staffGrant?.capability!=='products.create')return res.status(403).json({error:'Δεν υπάρχει δικαίωμα δημιουργίας είδους.'});
    try{
      const barcodeLookup=/^\/new-card\/stores\/([^/]+)\/barcode\/([0-9]{6,18})$/.exec(req.path);
      if(req.method==='GET'&&barcodeLookup){
        const [,storeId,barcode]=barcodeLookup;
        if(req.user.storeId!==storeId||Object.keys(req.query||{}).length)throw staffError();
        const result=await db.$transaction(async tx=>{
          await requireStaffAction(tx,req,storeId,'products.create');
          const rows=await tx.$queryRaw`
            SELECT DISTINCT p."name",p."id" FROM "Product" p
            JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true
            JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId"
            WHERE p."companyId"=${req.user.companyId} AND p."active"=true
              AND EXISTS (
                SELECT 1 FROM "ProductBarcode" b WHERE b."productId"=p."id" AND b."barcode"=${barcode}
              )
            ORDER BY p."id" LIMIT 2
          `;
          if(rows.length>1)throw staffError(409,'STAFF_BARCODE_AMBIGUOUS','Το barcode αντιστοιχεί σε περισσότερα είδη του καταστήματος.');
          return rows.length?{found:true,source:'MYWORKSTATION',product:{name:rows[0].name}}:{found:false};
        });
        return res.json({storeId,barcode,...result});
      }
      if(req.method==='GET'&&req.path==='/new-card/options')return res.json(await readInventoryNewCardOptions(db,req.user,String(req.query.storeId||'')));
      if(req.method==='POST'&&req.path==='/new-card'){
        const result=await createInventoryCard(db,req.user,req.body);
        return res.status(result.idempotent?200:201).json(result);
      }
      return res.status(403).json({error:'Η προσωπική πρόσβαση δεν επιτρέπει αυτή την ενέργεια.'});
    }catch(error){if(error?.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της νέας καρτέλας.'});next(error)}
  };
}
export const staffProductBridge=createStaffProductBridge(prisma);
