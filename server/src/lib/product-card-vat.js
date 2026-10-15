const fail=message=>{throw Object.assign(new Error(message),{status:400})};
export async function productCardVatOptions(db,companyId){
 return db.$queryRaw`SELECT "id","description","vatRate","cashRegisterDepartment","legacyVatCode" FROM "ManagementVatDepartment" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "vatRate","description","id"`;
}
// Resolve the explicit department inside the caller's transaction. Equal rates
// are not interchangeable: they may use different fiscal register departments.
export async function resolveProductCardVat(tx,companyId,departmentId,vatRate){
 if(!departmentId)fail('Επίλεξε Τμήμα ΦΠΑ.');
 const rows=await tx.$queryRaw`SELECT "id","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${departmentId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`;
 const dep=rows[0];if(!dep)fail('Το Τμήμα ΦΠΑ δεν είναι ενεργό ή δεν ανήκει στην εταιρεία.');
 if(Number(dep.vatRate)!==Number(vatRate))fail('Το ποσοστό ΦΠΑ άλλαξε. Επίλεξε ξανά το Τμήμα ΦΠΑ.');
 return {id:dep.id,vatRate:Number(dep.vatRate)};
}
