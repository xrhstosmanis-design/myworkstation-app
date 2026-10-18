import {withLifecycleContext} from '../services/store-lifecycle-context.js';
export const LIFECYCLE_GENERATIONS_HEADER='x-mws-store-generations';
// Epoch metadata grants no role, company or store permission. Existing route
// authorization and database ownership checks remain authoritative.
export function storeLifecycleRequestContext(req,res,next){
 const encoded=req.headers?.[LIFECYCLE_GENERATIONS_HEADER];
 try{
  if(encoded!==undefined&&(typeof encoded!=='string'||Buffer.byteLength(encoded)>16384))throw new TypeError('Invalid lifecycle header');
  const context=encoded===undefined?undefined:JSON.parse(encoded);
  return withLifecycleContext(context,next);
 }catch(error){
  if(!(error instanceof SyntaxError||error instanceof TypeError||error?.code==='STORE_LIFECYCLE_GENERATION_INVALID'))throw error;
  return res.status(400).json({error:'Μη έγκυρη έκδοση καταστήματος.',code:'STORE_LIFECYCLE_GENERATION_INVALID'});
 }
}
