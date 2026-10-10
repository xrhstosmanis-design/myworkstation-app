// Observe completed failed reads only. This module supplies no authorization.
const stores=new Set(['cmtpopbgo000trhb5ng9ytiru','cmuk8gxui000ppabfykdxwb1y','cmulj8rg5000qnrbfxi5sj6xl','cmulmjjoc000qqlbf2bn2ifj0','cmv25lf3h000ueegf0kkii3pb','cmv2qanca000psigeizep8o9m','kat-store']);
const companies=new Set(['cmtpopbgk000prhb5qc60zxus','pilot-company','cmulmjjoa000oqlbfyi0h53ju','cmv25lf0w000seegf1cn4bbmx']);
const roles=new Set(['OWNER','ADMIN','MANAGER','SUPER_ADMIN','EMPLOYEE']);
const tokens=new Set(['BACKOFFICE_USER','STORE_OPERATOR','STORE_DEVICE']);
const project=(value,allowed)=>typeof value==='string'&&allowed.has(value)?value:'OTHER_OR_MISSING';
export const PRODUCTION_STORE_READ_PREFIX='MWS_STORE_READ_404';

export function createProductionStoreReadDiagnostic({log=console.info,now=Date.now}={}){
  let start=null,records=new Map(),overflow=0,sampled=false;
  const emit=record=>{try{log(PRODUCTION_STORE_READ_PREFIX,JSON.stringify(record))}catch{/* Diagnostic failure never changes the response. */}};
  return (req,res,next)=>{
    // Capture only the two canonical polling routes; never export raw URLs.
    const match=req.method==='GET'&&typeof req.originalUrl==='string'&&req.originalUrl.length<=2048
      ? /^\/api\/(transactions|cloud\/v1)\/stores\/([^/?]{1,80})\/overview(?:\?[^#]*)?$/.exec(req.originalUrl):null;
    if(match){
      const requestedStoreId=project(match[2],stores);
      const route=`/api/${match[1]}/stores/:storeId/overview`;
      res.once('finish',()=>{try{
        if(res.statusCode!==404||!req.user||typeof req.user!=='object')return;
        const time=now();
        if(!Number.isFinite(time))return;
        if(start===null)start=time;
        if(time-start>=60000){
          emit({kind:'window',windowStart:new Date(start).toISOString(),windowEnd:new Date(time).toISOString(),records:[...records.values()],overflow});
          records=new Map();overflow=0;start=time;
        }
        const record={route,requestedStoreId,companyId:project(req.user.companyId,companies),credentialStoreId:project(req.user.storeId,stores),supportStoreId:project(req.user.supportContext?.storeId,stores),role:project(req.user.role,roles),tokenType:project(req.user.tokenType,tokens),status:404};
        const key=JSON.stringify(record);
        if(records.has(key))records.get(key).count++;
        else if(records.size<32)records.set(key,{...record,count:1});
        else overflow++;
        // First sample gives immediate attribution; window counts are separate.
        if(!sampled){sampled=true;emit({kind:'sample',...record})}
      }catch{/* No request, auth or response changes on malformed context. */}});
    }
    next();
  };
}
