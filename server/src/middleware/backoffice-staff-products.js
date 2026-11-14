import {z} from 'zod';
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
    const match=req.path.match(/^\/([^/]+)\/staff-card$/);
    if(req.user?.staffAccess===true&&match&&req.staffGrant?.capability==='products.edit'){
      try{
        const productId=decodeURIComponent(match[1]);
        const {companyId,storeId}=req.user;
        const read=async tx=>(await tx.$queryRaw`
          SELECT p."id",p."name",p."description",p."sku",
            COALESCE(sp."salePrice",p."salePrice",0)::float8 AS "salePrice",
            NOT EXISTS (SELECT 1 FROM "StoreProduct" other WHERE other."productId"=p."id" AND other."storeId"<>${storeId}) AS "canEditIdentity"
          FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id"
          WHERE p."id"=${productId} AND p."companyId"=${companyId} AND sp."storeId"=${storeId}
        `)[0];
        const found=await db.$transaction(async tx=>{
          await requireStaffAction(tx,req,storeId,'products.edit');
          if(req.method==='PATCH'){
            const body=z.object({name:z.string().trim().min(2).max(250),description:z.string().trim().max(1000),salePrice:z.number().finite().min(0).max(1000000)}).strict().parse(req.body);
            await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${productId} AND "companyId"=${companyId} FOR UPDATE`;
            const current=await read(tx);
            if(!current)return null;
            if(body.name!==current.name||body.description!==(current.description||'')){
              if(!current.canEditIdentity)throw staffError(409,'STAFF_SHARED_PRODUCT','Η περιγραφή κοινής καρτέλας αλλάζει από την Κεντρική Διαχείριση.');
              await tx.$executeRaw`UPDATE "Product" SET "name"=${body.name},"description"=${body.description},"updatedAt"=NOW() WHERE "id"=${productId} AND "companyId"=${companyId}`;
            }
            if(body.salePrice!==current.salePrice){
              await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${body.salePrice},"updatedAt"=NOW() WHERE "productId"=${productId} AND "storeId"=${storeId}`;
            }
          }
          return read(tx);
        },{isolationLevel:'Serializable'});
        return found?res.json(found):res.status(404).json({error:'Δεν βρέθηκε είδος στο επιλεγμένο κατάστημα.'});
      }catch(error){return next(error)}
    }
    if(req.user?.staffAccess!==true||req.staffGrant?.capability!=='products.create')return res.status(403).json({error:'Δεν υπάρχει δικαίωμα δημιουργίας είδους.'});
    try{
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
