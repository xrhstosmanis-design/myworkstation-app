import crypto from 'node:crypto';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {assertLabConfiguration,assertEmptyLabDatabase,initializeLabMarker,labIsolationAssertion,installLabOutboundFence} from './guard.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const warning='ΕΙΚΟΝΙΚΟ ΠΕΡΙΒΑΛΛΟΝ — μόνο συνθετικά δεδομένα. Καμία φορολογική ισχύς. Επανεκκίνηση διαγράφει τις δοκιμές.';
const execPrisma=()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import',path.join(root,'ops/wholesale-lab/guard.mjs'),path.join(root,'node_modules/prisma/build/index.js'),'db','push','--schema',path.join(root,'server/prisma/schema.prisma'),'--skip-generate'],{cwd:root,env:{...process.env,WHOLESALE_LAB_PRISMA_CHILD:'1',CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',DO_NOT_TRACK:'1'},stdio:['ignore','ignore','pipe']});
  let error='';child.stderr.on('data',data=>{error+=data.toString().slice(0,4000)});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Isolated schema preparation failed (no existing data reset). '+error.replaceAll(process.env.DATABASE_URL,'[isolated database]'))));
});
export async function startLabRuntime({initialize=false,port=Number(process.env.PORT||8080),host='0.0.0.0'}={}){
  const config=assertLabConfiguration();
  const fence=installLabOutboundFence();
  // Never accept a production JWT secret, even accidentally copied by a host.
  // Issued sessions and generated demo passwords are boot-only and never logged.
  process.env.JWT_SECRET=crypto.randomBytes(48).toString('base64url');
  const {PrismaClient}=await import('@prisma/client');
  const rawDb=new PrismaClient({datasourceUrl:config.databaseUrl,log:[]});
  globalThis.prisma=rawDb;
  try{
    if(!initialize)throw new Error('Use --initialize with a new disposable database; existing data is never reset.');
    await assertEmptyLabDatabase(rawDb);await execPrisma();await initializeLabMarker(rawDb,config);
    const assertIsolated=labIsolationAssertion(config);
    const {LAB_IDS,LAB_PRODUCTS,LAB_STORES,LAB_CUSTOMERS,seedWholesaleLab}=await import('./seed.mjs');
    const demo=await seedWholesaleLab(rawDb,{assertIsolated});
    const {ensureLabDocumentsSchema,createLabDocumentEngine}=await import('./documents.mjs');
    const {createLabDocumentsRouter}=await import('./documents-router.mjs');
    await ensureLabDocumentsSchema(rawDb,assertIsolated);
    const documentEngine=createLabDocumentEngine({db:rawDb,assertIsolated,ids:LAB_IDS});
    const stocks=await rawDb.$queryRaw`SELECT sp."storeId",sp."productId",sp."currentStock" FROM "StoreProduct" sp JOIN "Store" st ON st."id"=sp."storeId" WHERE st."companyId"=${LAB_IDS.company}`;
    for(const row of stocks)await documentEngine.seedStock({companyId:LAB_IDS.company,storeId:row.storeId,productId:row.productId,quantity:String(row.currentStock),requestId:'whlab-initial-'+row.storeId+'-'+row.productId});
    const [expressModule,authModule,authRoutes,management,capabilities,workspace,sellerAdmin,seller,portalAdmin,portal,entitlement,portalAuth]=await Promise.all([
      import('express'),import('../../server/src/middleware/auth.js'),import('../../server/src/routes/auth.js'),import('../../server/src/routes/wholesale-b2b.js'),import('../../server/src/routes/wholesale-capabilities.js'),import('../../server/src/routes/wholesale-workspace.js'),import('../../server/src/routes/wholesale-seller-admin.js'),import('../../server/src/routes/wholesale-sellers.js'),import('../../server/src/routes/wholesale-portal-admin.js'),import('../../server/src/routes/wholesale-portal.js'),import('../../server/src/lib/wholesale-entitlement.js'),import('../../server/src/lib/wholesale-portal-auth.js')
    ]);
    const express=expressModule.default,auth=authModule.auth,app=express();
    app.disable('x-powered-by');app.set('query parser','extended');
    const configuredOrigin=process.env.LAB_PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
    if(configuredOrigin){const parsed=new URL(configuredOrigin);if(parsed.origin!==configuredOrigin||!['http:','https:'].includes(parsed.protocol)||(!['localhost','127.0.0.1'].includes(parsed.hostname)&&(!parsed.hostname.endsWith('.onrender.com')||parsed.protocol!=='https:')))throw new Error('Only a dedicated Render or loopback laboratory origin is accepted.');}
    const expectedOrigin=req=>configuredOrigin||`http://${req.headers.host}`;
    app.use((req,res,next)=>{
      res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Wholesale-Lab':'synthetic-only'});
      if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==expectedOrigin(req))return res.status(403).json({error:'Η αίτηση πρέπει να προέρχεται από το ίδιο εικονικό περιβάλλον.',code:'LAB_ORIGIN_DENIED'});
      next();
    });
    app.use(express.json({limit:'64kb'}));
    const revision=process.env.RENDER_GIT_COMMIT||process.env.LAB_REVISION||'local-unreleased';
    app.get(['/health','/api/lab/health'],async(req,res,next)=>{try{await assertIsolated(rawDb);res.json({ok:true,testOnly:true,revision,bootId:config.bootId,outboundBlocked:fence.blocked})}catch(error){next(error)}});
    const metadata={lab:true,testOnly:true,virtualOnly:true,name:'MyWorkStation — Εικονικό εργαστήριο χονδρικής',revision,bootId:config.bootId,companyId:LAB_IDS.company,storeId:LAB_IDS.store,defaultStoreId:LAB_IDS.store,portalSlug:LAB_IDS.slug,roles:['owner','seller','unassigned','customer'],stores:LAB_STORES,customers:LAB_CUSTOMERS,products:LAB_PRODUCTS.map(({stock,price,basis,vat,...product})=>product),warning};
    app.get(['/api/lab/status','/api/lab/meta'],(req,res)=>res.json(metadata));
    let loginWindow=Date.now(),loginCount=0;
    app.post('/api/lab/session',async(req,res,next)=>{
      try{
        if(Date.now()-loginWindow>60000){loginWindow=Date.now();loginCount=0}
        if(++loginCount>80)return res.status(429).json({error:'Περίμενε ένα λεπτό πριν από νέα δοκιμαστική είσοδο.'});
        if(!req.body||Object.keys(req.body).length!==1||!metadata.roles.includes(req.body.role))return res.status(400).json({error:'Επίλεξε έναν από τους τέσσερις εικονικούς ρόλους.'});
        await assertIsolated(rawDb);
        const role=req.body.role,json=res.json.bind(res);
        res.json=data=>json({...data,...(res.statusCode<400?{targetUrl:role==='customer'?'/b2b/'+LAB_IDS.slug:'/wholesale?storeId='+LAB_IDS.store,testOnly:true}:{})});
        if(role==='customer'){
          req.body={...demo.customer};req.url='/'+LAB_IDS.slug+'/session';
          return portal.createWholesalePortalRouter({db:rawDb,expectedOrigin:expectedOrigin(req)}).handle(req,res,next);
        }
        res.append('Set-Cookie',portalAuth.portalCookie('',LAB_IDS.slug,{clear:true}));
        req.body={...demo.credentials[role],deviceName:'Εικονικό LAB — '+role};req.url='/login';
        return authRoutes.default.handle(req,res,next);
      }catch(error){next(error)}
    });
    // Only login/logout from the existing auth router are reachable. No setup,
    // account creation, support, company switch or admin endpoint is mounted.
    app.use('/api/auth',(req,res,next)=>{
      if(req.method!=='POST'||!['/login','/logout'].includes(req.path))return res.sendStatus(404);
      if(req.path==='/login'&&!Object.values(demo.credentials).some(value=>value.email===req.body?.email))return res.status(401).json({error:'Αυτό το περιβάλλον δέχεται μόνο εικονικούς λογαριασμούς.'});
      return authRoutes.default.handle(req,res,next);
    });
    app.use('/api/b2b',(req,res,next)=>portal.createWholesalePortalRouter({db:rawDb,expectedOrigin:expectedOrigin(req)}).handle(req,res,next));
    app.use('/api/wholesale/capabilities',auth,capabilities.default);
    app.use('/api/wholesale/workspace',auth,workspace.default);
    app.use('/api/wholesale/seller-admin',auth,entitlement.createWholesaleEntitlementGuard(),sellerAdmin.default);
    app.use('/api/wholesale/sellers',auth,entitlement.createWholesaleEntitlementGuard(),seller.default);
    app.use('/api/wholesale/portal',auth,entitlement.createWholesaleEntitlementGuard(),portalAdmin.default);
    app.use('/api/wholesale',auth,entitlement.createWholesaleEntitlementGuard(),management.default);
    app.use('/api/lab',auth,createLabDocumentsRouter({db:rawDb,assertIsolated,ids:LAB_IDS}));
    app.use('/api',(req,res)=>res.status(404).json({error:'Η διαδρομή δεν διατίθεται στο εικονικό περιβάλλον.',code:'LAB_ROUTE_UNAVAILABLE'}));
    app.get('/',(req,res)=>res.redirect('/lab'));
    app.get('/lab',(req,res)=>res.sendFile(path.join(root,'ops/wholesale-lab/public/index.html')));
    app.use('/lab',express.static(path.join(root,'ops/wholesale-lab/public'),{index:false,dotfiles:'deny',redirect:false}));
    app.use('/assets',express.static(path.join(root,'client/dist/assets'),{index:false,dotfiles:'deny',immutable:true,maxAge:'1h'}));
    // Public application shell only. Keep every API/auth response outside the
    // worker cache and never expose the whole production dist directory here.
    const wholesalePublicFiles=new Map([
      ['/wholesale-sw.js','wholesale-sw.js'],
      ['/wholesale-app/wholesale.webmanifest','wholesale-app/wholesale.webmanifest'],
      ['/pwa-192.png','pwa-192.png'],
      ['/pwa-512.png','pwa-512.png']
    ]);
    for(const [route,file] of wholesalePublicFiles)app.get(route,(req,res)=>res.sendFile(path.join(root,'client/dist',file)));
    const actualPage=file=>async(req,res,next)=>{try{
      const html=await readFile(path.join(root,'client/dist',file),'utf8');
      const banner='<div style="position:sticky;top:0;z-index:99999;background:#fef3c7;color:#713f12;padding:12px;text-align:center;font:700 15px system-ui"><a href="/lab" style="color:inherit">← Εργαστήριο</a> · ΜΟΝΟ ΔΟΚΙΜΕΣ — ΚΑΜΙΑ ΦΟΡΟΛΟΓΙΚΗ ΙΣΧΥΣ · Συνθετικά δεδομένα · Διαγράφονται στην επανεκκίνηση</div>';
      res.type('html').send(html.replace(/<body([^>]*)>/i,`<body$1>${banner}`));
    }catch(error){next(error)}};
    app.get('/wholesale',actualPage('wholesale.html'));
    app.get('/b2b/'+LAB_IDS.slug,actualPage('b2b.html'));
    app.use((req,res)=>res.sendStatus(404));
    app.use((error,req,res,next)=>{
      if(res.headersSent)return next(error);
      const status=error.name==='ZodError'?400:error.status>=400&&error.status<500?error.status:500;
      console.error('Wholesale laboratory request failed:',error.code||error.name);
      res.status(status).json({error:status===500?'Η δοκιμαστική υπηρεσία δεν είναι προσωρινά διαθέσιμη.':error.message,code:error.code||'LAB_REQUEST_FAILED'});
    });
    const server=await new Promise((resolve,reject)=>{const handle=app.listen(port,host,()=>resolve(handle));handle.once('error',reject)});
    const close=async()=>{await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()});await rawDb.$disconnect();fence.restore();delete process.env.JWT_SECRET;delete globalThis.prisma};
    return {app,server,db:rawDb,close,revision,bootId:config.bootId};
  }catch(error){await rawDb.$disconnect();fence.restore();delete process.env.JWT_SECRET;delete globalThis.prisma;throw error}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startLabRuntime({initialize:process.argv.includes('--initialize')}).then(runtime=>{
    console.log(JSON.stringify({event:'wholesale-lab-ready',testOnly:true,revision:runtime.revision,bootId:runtime.bootId,port:runtime.server.address().port}));
    let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(closing)return;closing=true;await runtime.close();process.exit(0)});
  }).catch(error=>{console.error('Wholesale laboratory startup refused:',error.code||error.name,error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database]'),...(error.safeTrace?[JSON.stringify(error.safeTrace)]:[]));process.exitCode=1});
}
