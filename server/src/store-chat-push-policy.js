export function isApplePushEndpoint(endpoint){
  try{
    const url=new URL(endpoint);
    return url.protocol==="https:"&&(url.hostname==="push.apple.com"||url.hostname.endsWith(".push.apple.com"));
  }catch{return false}
}
