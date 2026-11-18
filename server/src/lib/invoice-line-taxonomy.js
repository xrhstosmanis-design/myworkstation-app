import {z} from 'zod';

export const invoiceTaxonomySchema=z.object({categoryId:z.string().min(1).nullable(),subcategoryId:z.string().min(1).nullable(),vatDepartmentId:z.string().min(1).nullable()});
const fail=message=>{throw Object.assign(new Error(message),{status:400})};
export async function validateInvoiceTaxonomy(tx,companyId,values){
 if(values.categoryId){const [row]=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${values.categoryId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;if(!row)fail('Η Κατηγορία δεν είναι έγκυρη.');}
 if(values.subcategoryId){const [row]=await tx.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${values.subcategoryId} AND "categoryId"=${values.categoryId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;if(!row)fail('Η Υποκατηγορία δεν ανήκει στην Κατηγορία.');}
 if(values.vatDepartmentId){const [row]=await tx.$queryRaw`SELECT "id" FROM "ManagementVatDepartment" WHERE "id"=${values.vatDepartmentId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;if(!row)fail('Το Τμήμα ΦΠΑ δεν είναι έγκυρο.');}
 return values;
}
export async function saveInvoiceStoreTaxonomy(tx,{companyId,storeId,productId,values}){
 await validateInvoiceTaxonomy(tx,companyId,values);
 // Store overrides use a non-null category to distinguish an explicitly empty subcategory.
 if(!values.categoryId)fail('Επίλεξε Κατηγορία για το είδος.');
 if(!values.vatDepartmentId)fail('Επίλεξε Τμήμα ΦΠΑ για το είδος.');
 const [before]=await tx.$queryRaw`SELECT sp."categoryIdOverride",sp."subcategoryIdOverride",sp."vatDepartmentIdOverride" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId} WHERE sp."productId"=${productId} AND sp."storeId"=${storeId} AND sp."active"=true AND p."active"=true FOR UPDATE OF sp`;
 if(!before)throw Object.assign(new Error('Το είδος δεν είναι ενεργό στο επιλεγμένο κατάστημα.'),{status:404});
 await tx.$executeRaw`UPDATE "StoreProduct" SET "categoryIdOverride"=${values.categoryId},"subcategoryIdOverride"=${values.subcategoryId},"vatDepartmentIdOverride"=${values.vatDepartmentId},"updatedAt"=NOW() WHERE "productId"=${productId} AND "storeId"=${storeId}`;
 return {before,after:values};
}
