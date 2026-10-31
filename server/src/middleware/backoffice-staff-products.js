import {prisma} from '../prisma.js';
import {createInventoryCard} from '../lib/inventory-new-card.js';
import {readInventoryNewCardOptions} from '../lib/inventory-new-card-options.js';

// Owner product mounts precede the canonical action router. Finish only these
// exact delegated actions before any owner-wide bootstrap/audit middleware.
// auth has already bound the real store and checked the exact live capability;
// both canonical services recheck current grant/session/licence themselves.
export function createStaffProductBridge(db){
  return async(req,res,next)=>{
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
