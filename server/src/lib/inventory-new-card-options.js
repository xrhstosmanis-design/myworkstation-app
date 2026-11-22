import {productCardVatOptions} from './product-card-vat.js';
import {requireStaffGrant} from '../services/backoffice-staff-access.js';

export async function readInventoryNewCardOptions(db,user,storeId){
 const company=user?.companyId;
 if(!company||!storeId||(user.storeId&&user.storeId!==storeId))throw Object.assign(new Error('Επίλεξε έγκυρο κατάστημα.'),{status:403});
 if(user.staffAccess===true)await requireStaffGrant(db,user,storeId,'products.create');
 if(!await db.store.findFirst({where:{id:storeId,companyId:company,active:true},select:{id:true}}))throw Object.assign(new Error('Δεν βρέθηκε το κατάστημα.'),{status:404});
 const [suppliers,brands,vatDepartments,categories,subcategories]=await Promise.all([
  db.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${company} AND "active"=true ORDER BY "name"`,
  db.$queryRaw`SELECT "id","name" FROM "ManagementProductCompany" WHERE "companyId"=${company} AND "active"=true ORDER BY "name"`,
  productCardVatOptions(db,company),
  db.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${company} AND "active"=true ORDER BY "name","id"`,
  db.$queryRaw`SELECT "id","categoryId","name" FROM "ProductSubcategory" WHERE "companyId"=${company} AND "active"=true ORDER BY "name","id"`
 ]);
 if(user.staffAccess===true)await requireStaffGrant(db,user,storeId,'products.create');
 return {suppliers,brands,vatDepartments,taxonomy:{categories,subcategories}};
}
