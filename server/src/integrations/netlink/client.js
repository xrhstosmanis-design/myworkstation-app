const trimSlash=value=>String(value||"").replace(/\/+$/g,"");

function required(value,name){
  if(!String(value||"").trim()){
    const error=new Error(`Λείπει η ρύθμιση ${name} για το Netlink connector.`);
    error.status=503;
    error.code="NETLINK_NOT_CONFIGURED";
    throw error;
  }
  return String(value).trim();
}

async function parseResponse(response){
  const text=await response.text();
  let body=null;
  if(text){try{body=JSON.parse(text)}catch{body={raw:text}}}
  if(!response.ok){
    const error=new Error(body?.error_description||body?.message||body?.error||`Netlink API HTTP ${response.status}`);
    error.status=response.status>=500?502:400;
    error.code="NETLINK_API_ERROR";
    error.providerStatus=response.status;
    error.providerBody=body;
    throw error;
  }
  return body;
}

export class NetlinkClient{
  constructor(config={}){
    this.tokenUrl=required(config.tokenUrl||process.env.NETLINK_TOKEN_URL,"NETLINK_TOKEN_URL");
    this.apiBase=trimSlash(required(config.apiBase||process.env.NETLINK_API_BASE,"NETLINK_API_BASE"));
    this.clientId=required(config.clientId||process.env.NETLINK_CLIENT_ID,"NETLINK_CLIENT_ID");
    this.clientSecret=required(config.clientSecret||process.env.NETLINK_CLIENT_SECRET,"NETLINK_CLIENT_SECRET");
    this.username=required(config.username||process.env.NETLINK_USERNAME,"NETLINK_USERNAME");
    this.password=required(config.password||process.env.NETLINK_PASSWORD,"NETLINK_PASSWORD");
    this.accessToken=null;
    this.refreshToken=null;
    this.expiresAt=0;
  }

  async obtainToken(){
    const payload=new URLSearchParams({grant_type:"password",client_id:this.clientId,client_secret:this.clientSecret,username:this.username,password:this.password});
    const response=await fetch(this.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:payload});
    const body=await parseResponse(response);
    this.setToken(body);
    return body;
  }

  async refreshAccessToken(){
    if(!this.refreshToken)return this.obtainToken();
    const payload=new URLSearchParams({grant_type:"refresh_token",client_id:this.clientId,client_secret:this.clientSecret,refresh_token:this.refreshToken});
    const response=await fetch(this.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:payload});
    if(response.status===400||response.status===401)return this.obtainToken();
    const body=await parseResponse(response);
    this.setToken(body);
    return body;
  }

  setToken(body={}){
    this.accessToken=body.access_token||null;
    this.refreshToken=body.refresh_token||this.refreshToken||null;
    const expiresIn=Math.max(30,Number(body.expires_in||300));
    this.expiresAt=Date.now()+expiresIn*1000;
  }

  async token(){
    if(!this.accessToken)return (await this.obtainToken()).access_token;
    if(Date.now()>=this.expiresAt-30000)return (await this.refreshAccessToken()).access_token;
    return this.accessToken;
  }

  async request(path,{method="GET",body,requestId}={}){
    let token=await this.token();
    const call=()=>fetch(`${this.apiBase}${path}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(body!==undefined?{"Content-Type":"application/json"}:{}),...(requestId?{"X-Request-Id":requestId}:{})},body:body!==undefined?JSON.stringify(body):undefined});
    let response=await call();
    if(response.status===401){token=(await this.refreshAccessToken()).access_token;response=await call()}
    return parseResponse(response);
  }

  menu(){return this.request("/menu")}
  prepare(productId,{requestId,payload}){return this.request(`/${encodeURIComponent(productId)}/prepare`,{method:"POST",requestId,body:{requestId,payload}})}
  execute(productId,{requestId,payload,confirmation}){return this.request(`/${encodeURIComponent(productId)}/execute`,{method:"POST",requestId,body:{requestId,payload,...(confirmation?{confirmation}:{})}})}
}

let singleton;
export function netlinkClient(){if(!singleton)singleton=new NetlinkClient();return singleton}
export function resetNetlinkClient(){singleton=undefined}
