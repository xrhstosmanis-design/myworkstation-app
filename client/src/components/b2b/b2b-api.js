export function createB2BApi(slug,{fetchImpl=globalThis.fetch}={}){
 if(typeof slug!=='string'||slug.length<3||slug.length>63||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw Error('Μη έγκυρη διεύθυνση χονδρικής.');
 let csrf='';
 const api=async(path,{method='GET',body,...rest}={})=>{
  if(!/^\/[a-z]+(?:\/[a-zA-Z0-9-]+)?(?:\?.*)?$/.test(path))throw Error('Μη έγκυρη διαδρομή.');
  const response=await fetchImpl(`/api/b2b/${encodeURIComponent(slug)}${path}`,{...rest,method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(method!=='GET'&&csrf?{'X-CSRF-Token':csrf}:{})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
  let data;try{data=await response.json()}catch{throw Object.assign(Error('Μη αναγνωρίσιμη απάντηση. Η έκβαση χρειάζεται επιβεβαίωση.'),{status:response.ok?502:response.status})}
  if(!response.ok)throw Object.assign(Error(data.error||'Η αίτηση δεν ολοκληρώθηκε.'),{status:response.status,code:data.code,details:data.details});
  if(data.csrfToken)csrf=data.csrfToken;
  return data;
 };
 api.clear=()=>{csrf=''};
 return api;
}
