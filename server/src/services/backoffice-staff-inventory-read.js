import {staffError,requireStaffGrant} from './backoffice-staff-access.js';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';

export function inventoryReadVisibility(grant){
  const rights=grant.capabilities;
  return {
    history:rights.includes('inventory.history.read'),
    expected:rights.includes('inventory.expected.read')||rights.includes('inventory.finalize'),
    finalizer:rights.includes('inventory.finalize'),
  };
}
async function epoch(db,user,storeId){
  const state=await readLifecycleGeneration(db,{companyId:user.companyId,storeId});
  if(state.maintenance||state.retired)throw staffError(409,'STAFF_SOURCE_CHANGED','Το κατάστημα βρίσκεται σε συντήρηση. Ανανέωσε μετά την ολοκλήρωσή της.');
  return state.generation;
}
export async function captureInventoryRead(db,user,storeId){
  const {grant}=await requireStaffGrant(db,user,storeId,'inventory.read');
  return {visibility:inventoryReadVisibility(grant),revision:grant.revision,generation:await epoch(db,user,storeId)};
}
export async function verifyInventoryRead(db,user,storeId,before){
  const generation=await epoch(db,user,storeId);
  const {grant}=await requireStaffGrant(db,user,storeId,'inventory.read');
  const after={generation,revision:grant.revision,visibility:inventoryReadVisibility(grant)};
  if(after.generation!==before.generation||after.revision!==before.revision||JSON.stringify(after.visibility)!==JSON.stringify(before.visibility))throw staffError(409,'STAFF_SOURCE_CHANGED','Άλλαξαν τα δικαιώματα ή τα δεδομένα του καταστήματος. Ανανέωσε την απογραφή.');
}
const quantity=value=>{
  const text=String(value);
  if(value===null||value===undefined||! /^-?\d+(?:\.\d+)?$/.test(text))throw staffError(503,'STAFF_INVENTORY_UNAVAILABLE','Δεν επιβεβαιώθηκαν οι ποσότητες της απογραφής.');
  return text;
};
// This is the existing personal count DTO, not the native financial/audit DTO.
// Explicit fields prevent future SELECT additions from widening disclosure.
export function personalInventoryLine(line,canSeeExpected){
  if(!Array.isArray(line.barcodes)||line.barcodes.some(code=>typeof code!=='string'))throw staffError(503,'STAFF_INVENTORY_UNAVAILABLE','Δεν επιβεβαιώθηκαν οι κωδικοί της απογραφής.');
  return {
    id:line.id,productId:line.productId,name:line.name,sku:line.sku,
    countedQuantity:line.countedQuantity===null?null:quantity(line.countedQuantity),
    countVersion:line.countVersion,recountRequired:line.recountRequired,
    barcodes:[...line.barcodes],
    ...(canSeeExpected?{expectedQuantity:quantity(line.expectedQuantity)}:{}),
  };
}
