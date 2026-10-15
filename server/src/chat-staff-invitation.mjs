// Preparing a public Chat link never creates credentials or grants access.
export function mayInviteToChat(user){
  if(user?.tokenType&&user.tokenType!=="BACKOFFICE_USER")return false;
  return Boolean(user&&(user.role==="OWNER"||user.role==="SUPER_ADMIN"||user.isSuperAdmin===true||user.platformRole==="SUPER_ADMIN"));
}

export function createChatStaffInvitation({db,contextFor,loadEmployee,chatEnabled,companyModuleState,effectiveModuleEnabled}){
  return async(req,res,next)=>{try{
    res.set("Cache-Control","no-store, private");
    if(!mayInviteToChat(req.user))return res.status(403).json({error:"Η πρόσκληση στο Chat επιτρέπεται μόνο σε Ιδιοκτήτη ή Super Admin."});
    const context=await contextFor(req),{company,store}=context;
    const employee=await loadEmployee(req,context,req.params.employeeId);
    const assigned=employee.baseStoreId===store.id||employee.storeAccess?.some(access=>access.storeId===store.id&&access.active);
    if(!employee.active||!assigned)return res.status(404).json({error:"Δεν βρέθηκε ενεργός εργαζόμενος στο επιλεγμένο κατάστημα."});
    const activeStore=await db.store.findFirst({where:{id:store.id,companyId:company.id,active:true,company:{active:true}},select:{id:true}});
    if(!activeStore)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});
    if(!await chatEnabled(store))return res.status(403).json({error:"Το Chat δεν είναι ενεργό στο επιλεγμένο κατάστημα."});
    const state=await companyModuleState(company.id);
    const overrides=await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${store.id} AND "moduleKey"='STORE_MODE' LIMIT 1`;
    if(!state?.licenseAllowed||!effectiveModuleEnabled(state.activeModules.includes("STORE_MODE"),overrides[0]?{...overrides[0],configured:true}:{configured:false}))return res.status(403).json({error:"Το Store Mode δεν είναι ενεργό στο επιλεγμένο κατάστημα."});
    if(!employee.legacyEmployeeId)return res.status(409).json({error:"Δεν έχει συνδεθεί ενεργός χειριστής με αυτόν τον εργαζόμενο. Ρύθμισε πρώτα τον χειριστή και το προσωπικό PIN του στο κατάστημα."});
    const credentials=await db.$queryRaw`SELECT c."displayName" FROM "StoreOperatorCredential" c JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId" AND e."active"=TRUE WHERE c."companyId"=${company.id} AND c."storeId"=${store.id} AND c."employeeId"=${employee.legacyEmployeeId} AND c."active"=TRUE AND c."pinHash" IS NOT NULL LIMIT 1`;
    if(!credentials[0])return res.status(409).json({error:"Ο εργαζόμενος χρειάζεται ενεργό χειριστή με προσωπικό PIN σε αυτό το κατάστημα. Δεν δημιουργήθηκε ούτε άλλαξε PIN."});
    return res.json({employee:{id:employee.id,fullName:employee.fullName},store:{id:store.id,name:store.name},operatorName:credentials[0].displayName,chatPath:`/chat/${encodeURIComponent(store.id)}/`});
  }catch(error){next(error)}};
}
