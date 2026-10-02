const storeIdPattern=/^(?:[a-z0-9]{12,64}|[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9]))$/;

export const validPwaStoreId=value=>storeIdPattern.test(String(value||""));

export const storeManifest=storeId=>({
  id:`/store/${storeId}`,
  name:"MyWorkStation · Κατάστημα",
  short_name:"MyWorkStation POS",
  description:"Λειτουργία καταστήματος και παραγγελιοληψία MyWorkStation",
  lang:"el",
  start_url:`/store/${storeId}`,
  scope:"/",
  display:"standalone",
  orientation:"any",
  theme_color:"#123b5d",
  background_color:"#f4f7fb",
  icons:[
    {src:"/icons/mws-192.svg",sizes:"192x192",type:"image/svg+xml",purpose:"any maskable"},
    {src:"/icons/mws-512.svg",sizes:"512x512",type:"image/svg+xml",purpose:"any maskable"}
  ]
});

export const storeHtmlWithManifest=(html,storeId)=>html.replace(
  '<link rel="manifest" href="/manifest.webmanifest">',
  `<link rel="manifest" href="/store/${storeId}/manifest.webmanifest">`
);
