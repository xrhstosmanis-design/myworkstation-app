// User foreign keys must never receive a POS credential identity.
export async function mappingConfirmationUserId(tx,{actor,companyId}){
  if(!actor||actor.tokenType==="STORE_OPERATOR")return null;
  const candidate=String(actor.id||"").trim();
  if(!candidate||!companyId)return null;
  const platform=actor.role==="SUPER_ADMIN"||actor.platformRole==="SUPER_ADMIN"||actor.isSuperAdmin===true;
  const rows=await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${candidate} AND ("companyId"=${companyId} OR ${platform}) LIMIT 1`;
  return rows[0]?.id||null;
}
