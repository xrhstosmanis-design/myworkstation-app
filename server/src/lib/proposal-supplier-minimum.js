import {createHash} from 'node:crypto';

export const supplierMinimumSection='purchaseSupplierMinimums';
export function supplierMinimumKey(supplierId,productId){
 return createHash('sha256').update(JSON.stringify([supplierId,productId])).digest('hex');
}
