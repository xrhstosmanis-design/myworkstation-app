export function createSellerApi(request){
 let expected=null;
 const api=async(path,options={})=>{
  if(!/^\/[a-z]+(?:\/[a-zA-Z0-9-]+)?(?:\?.*)?$/.test(path))throw Error('Μη έγκυρη διαδρομή πωλητή.');
  const context=path.split('?')[0]==='/context';
  if(!context&&!expected)throw Object.assign(Error('Επανέλεγξε την πρόσβαση πωλητή.'),{status:428});
  const result=await request('/api/wholesale/sellers'+path,{...options,headers:context?{}:{'X-Wholesale-Seller':expected.userId,'X-Wholesale-Company':expected.companyId}});
  if(context){if(!result?.user?.id||!result.companyId||!result.actorId||!Array.isArray(result.stores))throw Error('Δεν επιβεβαιώθηκε η πρόσβαση πωλητή.');expected={userId:result.user.id,companyId:result.companyId};}
  return result;
 };
 api.bind=context=>{expected={userId:context.user.id,companyId:context.companyId}};api.clear=()=>{expected=null};return api;
}
