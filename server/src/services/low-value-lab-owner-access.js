const LAB_COMPANY_ID="cmtpopbgk000prhb5qc60zxus";
const LAB_STORE_ID="cmtpopbgo000trhb5ng9ytiru";
const MAX_WINDOW_MS=24*60*60*1000;

export function lowValueLabOwnerAccess(user,store,company,{window=process.env.LOW_VALUE_LAB_OWNER_WINDOW,now=Date.now()}={}){
  const [start,end,extra]=(window??"").split("/");
  const startsAt=Date.parse(start);
  const expiresAt=Date.parse(end);
  return user?.role==="OWNER"&&user.companyId===LAB_COMPANY_ID&&
    user.tokenType!=="STORE_OPERATOR"&&!user.supportContext&&
    store?.id===LAB_STORE_ID&&store.companyId===LAB_COMPANY_ID&&
    store.active===true&&store.name==="ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ"&&
    company?.id===LAB_COMPANY_ID&&company.name==="MYWORKSTATION LAB"&&
    extra===undefined&&startsAt<=now&&now<expiresAt&&expiresAt-startsAt<=MAX_WINDOW_MS;
}
