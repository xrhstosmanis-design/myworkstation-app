// Non-secret metadata only. A reviewed pending card can cross POS shifts;
// its saved PIN is restricted to the original operator, privileged users,
// or the actual winning recovery actor recorded by the server.
export async function readReviewedRecoveryAccess(db,scope,actorId,requestId=null){
 if(!actorId)return [];
 return db.$queryRaw`SELECT n."requestId",(n."status"='RECOVERY_READY') AS "ready",d."handledByActor"
 FROM "NetlinkTransaction" n
 JOIN "StoreOperatorAudit" r ON r."companyId"=n."companyId" AND r."storeId"=n."storeId" AND r."eventType"='NETLINK_NONEXECUTION_REVIEW' AND r."details"->>'requestId'=n."requestId"
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM "StoreOperatorAudit" a WHERE a."companyId"=n."companyId" AND a."storeId"=n."storeId" AND a."eventType"='NETLINK_PAID_RECOVERY_DISPATCH' AND a."actorId"=${actorId} AND a."details"->>'requestId'=n."requestId" AND a."details"->>'resolutionId'=r."details"->>'resolutionId' AND a."details"->>'providerRequestId'=r."details"->>'providerRequestId') AS "handledByActor") d
 WHERE n."companyId"=${scope.companyId} AND n."storeId"=${scope.storeId} AND n."issuanceIntentEnc" IS NOT NULL
 AND (${requestId}::text IS NULL OR n."requestId"=${requestId})
 AND r."actorId" IS NOT NULL AND r."actorId"<>'' AND r."details"->>'actorId'=r."actorId" AND r."details"->>'version'='1'
 AND r."details"->>'saleId'=n."saleId" AND r."details"->>'checkoutId'=n."checkoutId"
 AND r."details"->>'originalDispatchAt'=to_char(n."providerDispatchedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 AND COALESCE(r."details"->>'resolutionId','')<>'' AND COALESCE(r."details"->>'fingerprint','')<>''
 AND COALESCE(r."details"->>'confirmedAt','')<>'' AND COALESCE(r."details"->>'providerReference','')<>''
 AND COALESCE(r."details"->>'providerRequestId','')~'^[1-9][0-9]{0,9}$'
 AND (SELECT COUNT(*) FROM "StoreOperatorAudit" x WHERE x."companyId"=n."companyId" AND x."storeId"=n."storeId" AND x."eventType"='NETLINK_NONEXECUTION_REVIEW' AND x."details"->>'requestId'=n."requestId")=1
 AND (n."status"='RECOVERY_READY' OR d."handledByActor")
 ORDER BY (n."status"='RECOVERY_READY') DESC,n."createdAt" DESC LIMIT 100`;
}
