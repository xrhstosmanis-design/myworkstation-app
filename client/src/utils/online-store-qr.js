import QRCode from 'qrcode';
export function publicOnlineStoreUrl(origin,slug){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug||'')))return '';
 try{const base=new URL(origin);if(!['https:','http:'].includes(base.protocol))return '';return `${base.origin}/online/${slug}`}catch{return ''}
}
export async function onlineStoreQR(origin,savedSlug){
 const url=publicOnlineStoreUrl(origin,savedSlug);if(!url)return{url:'',image:''};
 return{url,image:await QRCode.toDataURL(url,{width:720,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}})};
}
