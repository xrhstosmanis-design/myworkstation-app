// Closed policy facts only: never persist input, files or arbitrary options.
// A hidden history or mixed lifetime needs the provider's explicit partition.
export function requestCacheWritePolicy(settings){
  const unknown=()=>({schemaVersion:1,state:'UNKNOWN'});
  if(!settings||typeof settings!=='object'||Array.isArray(settings))return unknown();
  for(const key of ['previous_response_id','conversation','prompt','prompt_cache_retention'])
    if(settings[key]!==undefined&&settings[key]!==null)return unknown();
  const options=settings.prompt_cache_options;
  if(options!==undefined&&(!options||typeof options!=='object'||Array.isArray(options)||
    Object.keys(options).some(key=>!['ttl','mode'].includes(key))))return unknown();
  if(options?.mode!==undefined&&!['implicit','explicit'].includes(options.mode))return unknown();
  const ttl=options?.ttl===undefined?'30m':options.ttl;
  if(!['30m','12h'].includes(ttl))return unknown();
  let invalid=false,mixed=false,remaining=10000;
  const seen=new Set();
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(--remaining<0||seen.has(value)){invalid=true;return;}
    seen.add(value);
    if(value.type==='item_reference')invalid=true;
    if(Object.hasOwn(value,'prompt_cache_breakpoint')){
      const point=value.prompt_cache_breakpoint;
      if(!point||typeof point!=='object'||Array.isArray(point)||
        Object.keys(point).some(key=>!['ttl','mode'].includes(key))||
        (point.mode!==undefined&&point.mode!=='explicit')||
        (point.ttl!==undefined&&!['30m','12h'].includes(point.ttl)))invalid=true;
      else if(point.ttl!==undefined&&point.ttl!==ttl)mixed=true;
    }
    for(const [key,item]of Object.entries(value))if(key!=='prompt_cache_breakpoint')visit(item);
  }
  visit(settings.input);
  if(invalid)return unknown();
  if(mixed)return {schemaVersion:1,state:'MIXED'};
  return {schemaVersion:1,state:'UNIFORM',ttl,source:options?.ttl===undefined?'REQUEST_DEFAULT':'REQUEST_EXPLICIT'};
}
