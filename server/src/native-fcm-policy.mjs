export async function nativeRecipientAllowed(row,store,{db,storesFor,enabled,authorize,now=Date.now,expiredAdminNotices=process.env.NATIVE_CHAT_EXPIRED_ADMIN_NOTICES==='true'}){
 const u=row.identityJson;
 if(!u||u.id!==row.userId)return false;
 if(u.tokenType==='STORE_OPERATOR'){
  if(u.storeId!==store.id||u.companyId!==store.companyId||u.chatSessionId!==row.sessionId)return false;
  const authorized=await authorize({originalUrl:`/api/store-chat/stores/${encodeURIComponent(store.id)}/native-push`},{...u,iss:'myworkstation-chat',aud:'store-chat-only'},{db});
  return Boolean(authorized)&&await enabled(store);
 }
 if(u.tokenType!=='BACKOFFICE_USER')return false;
 const session=await db.userSession.findUnique({where:{id:row.sessionId},include:{user:{include:{company:true}}}});
 const current=session?.user;
 const expires=session?.expiresAt==null?NaN:new Date(session.expiresAt).getTime(), time=now();
 const noticeWindow=expiredAdminNotices&&current?.role==='SUPER_ADMIN'&&!u.supportContext&&time-expires<24*60*60*1000;
 if(!current||current.id!==row.userId||session.revokedAt||(!Number.isFinite(expires)||(expires<=time&&!noticeWindow))||current.role!==(u.platformRole||u.role)||current.sessionVersion!==u.sessionVersion||current.mustChangePassword||(!current.company?.active&&current.role!=='SUPER_ADMIN'))return false;
 if(u.supportContext&&u.companyId!==store.companyId)return false;
 const resolved={...u,platformRole:current.role,isSuperAdmin:current.role==='SUPER_ADMIN',sessionId:row.sessionId,companyId:current.companyId,supportContext:u.supportContext?{native:true}:undefined};
 // A support context stays restricted to its originally selected company.
 if(u.supportContext)resolved.companyId=u.companyId;
 return (await storesFor(resolved)).stores.some(s=>s.id===store.id&&s.companyId===store.companyId);
}
