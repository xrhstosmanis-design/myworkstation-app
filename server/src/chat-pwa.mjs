
export function chatManifest(){return {id:"/chat/",name:"MyWorkStation Chat",short_name:"MW Chat",description:"Τα καταστήματά μου · Chat και ειδοποιήσεις",lang:"el",start_url:"/chat/",scope:"/chat/",display:"standalone",theme_color:"#123b5d",background_color:"#f4f7fb",icons:[{src:"/pwa-192.png",sizes:"192x192",type:"image/png",purpose:"any maskable"},{src:"/pwa-512.png",sizes:"512x512",type:"image/png",purpose:"any maskable"}]}}
export function chatHtmlWithManifest(html){return html.replace('navigator.serviceWorker.register("/sw.js")','navigator.serviceWorker.register("/chat/sw.js",{scope:"/chat/"})').replace(/<link rel="manifest"[^>]*>/,'<link rel="manifest" href="/chat/manifest.webmanifest">').replace("<title>MyWorkStation App</title>","<title>MyWorkStation Chat</title>").replace("</head>",'<meta name="apple-mobile-web-app-title" content="MW Chat"></head>')}
export function registerChatPwa(app,{dist,readFile,path}){
 app.get("/chat/manifest.webmanifest",(req,res)=>res.set("Cache-Control","no-store").type("application/manifest+json").json(chatManifest()));
 app.get("/chat/sw.js",(req,res)=>res.set("Cache-Control","no-cache").type("application/javascript").sendFile(path.join(dist,"sw.js")));
 app.get(["/chat","/chat/:storeId"],async(req,res,next)=>{if(req.params.storeId&&!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.storeId))return res.sendStatus(404);try{res.set("Cache-Control","no-store").type("html").send(chatHtmlWithManifest(await readFile(path.join(dist,"index.html"),"utf8")))}catch(error){next(error)}});
}
