import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAiOwnerWalletRepository} from '../src/services/ai-owner-wallet-repository.js';
import {createWalletNotificationDispatcher} from '../src/services/ai-owner-wallet-notifications.js';
import {createWalletAccess} from '../src/services/ai-owner-wallet-access.js';
import {createAiOwnerWalletRoutes} from '../src/routes/ai-owner-wallet.js';
import {createWalletProvider} from '../src/services/ai-owner-wallet-provider.js';
import {readWalletUsageSummary} from '../src/services/ai-owner-wallet-usage.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('native AI wallet: atomic all-store funding/holds/usage, scoped HTTP access, notifications and unchanged business controls',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ai_wallet_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let server;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      `CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN','OWNER','ADMIN','MANAGER','EMPLOYEE')`,
      'CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)',
      'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)',
      'CREATE TABLE "User"("id" text PRIMARY KEY,"email" text,"fullName" text,"role" "UserRole","companyId" text,"sessionVersion" integer,"mustChangePassword" boolean)',
      'CREATE TABLE "UserSession"("id" text PRIMARY KEY,"userId" text,"deviceName" text,"userAgent" text,"ipAddress" text,"createdAt" timestamp,"lastSeenAt" timestamp,"expiresAt" timestamp,"revokedAt" timestamp)',
      'CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)',
      'CREATE TABLE "BusinessControl"("id" text PRIMARY KEY,"sales" integer,"cash" numeric,"stock" integer)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Company" VALUES('c','Synthetic wallet company',true),('x','Foreign',true)`;
    await db.$executeRaw`INSERT INTO "Store" VALUES('s','Store 1','c',true),('s2','Store 2','c',true),('foreign','Foreign','x',true),('inactive','Inactive','c',false)`;
    await db.$executeRaw`INSERT INTO "User" VALUES('owner','owner@example.invalid','Owner','OWNER','c',1,false),('admin','admin@example.invalid','Admin','SUPER_ADMIN','c',1,false),('employee','employee@example.invalid','Employee','EMPLOYEE','c',1,false)`;
    for(const id of ['owner','admin','employee'])await db.$executeRaw`INSERT INTO "UserSession" VALUES(${id+'-session'},${id},null,null,null,NOW(),NOW(),NOW()+INTERVAL '1 day',null)`;
    await db.$executeRaw`INSERT INTO "BusinessControl" VALUES('control',12,123.45,25)`;
    const before=await db.$queryRaw`SELECT * FROM "BusinessControl"`;
    const repository=createAiOwnerWalletRepository(db);await repository.ensure();
    // More than the recent100 rows; Athens midnight/month boundaries, both
    // invoice providers, foreign scopes, future rows and unsettled holds.
    await db.$executeRaw`INSERT INTO "AiOwnerWallet" ("companyId","cycleId") VALUES ('report-company','report-cycle'),('report-foreign','foreign-cycle')`;
    await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","chargedMicros","feature","createdAt","settledAt")
      SELECT 'report-question-'||n,'report-company','report-store','USAGE','report-question-'||n,'SETTLED',1,1,'OWNER_ASSISTANT','2026-10-21T21:10:00Z'::timestamptz,'2026-10-21T21:10:00Z'::timestamptz FROM generate_series(1,125) n`;
    const reportRows=[
      ['openai','report-company','report-store','SETTLED','INVOICE_OPENAI',70,'2026-10-21T21:15:00Z'],
      ['azure','report-company','report-store','SETTLED','INVOICE_AZURE',30,'2026-10-21T20:59:59Z'],
      ['other','report-company','report-store','SETTLED','FUTURE_AI',25,'2026-09-30T21:00:00Z'],
      ['old','report-company','report-store','SETTLED','INVOICE_OPENAI',1000,'2026-09-30T20:59:59Z'],
      ['store-control','report-company','other-store','SETTLED','OWNER_ASSISTANT',9000,'2026-10-21T21:15:00Z'],
      ['company-control','report-foreign','report-store','SETTLED','OWNER_ASSISTANT',90000,'2026-10-21T21:15:00Z'],
      ['future','report-company','report-store','SETTLED','INVOICE_OPENAI',700,'2026-10-21T22:00:00Z'],
      ['review','report-company','report-store','REVIEW','INVOICE_OPENAI',0,null],
      ['reserved','report-company','report-store','RESERVED','OWNER_ASSISTANT',0,null]
    ];
    for(const [id,company,store,status,feature,charged,settled] of reportRows)await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","chargedMicros","feature","settledAt") VALUES (${id},${company},${store},'USAGE',${id},${status},${charged+10},${charged},${feature},${settled}::timestamptz)`;
    await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","kind","reference","status","creditedMicros") VALUES ('report-credit','report-company','CREDIT','report-credit','CREDITED',5000)`;
    const summary=await readWalletUsageSummary(db,'report-company','report-store',new Date('2026-10-21T21:30:00Z'));
    assert.equal(summary.localDate,'2026-10-22');assert.equal(summary.monthStartDate,'2026-10-01');
    assert.equal(summary.allTimeMicros,'1250');assert.equal(summary.monthMicros,'250');assert.equal(summary.todayMicros,'195');
    assert.deepEqual(summary.categories,[{category:'INVOICES',allTimeMicros:'1100',monthMicros:'100',todayMicros:'70'},{category:'OTHER',allTimeMicros:'25',monthMicros:'25',todayMicros:'0'},{category:'QUESTIONS',allTimeMicros:'125',monthMicros:'125',todayMicros:'125'}]);
    assert.ok(summary.daily.some(r=>r.date==='2026-10-21'&&r.category==='INVOICES'&&r.chargedMicros==='30'));
    assert.equal(summary.daily.reduce((n,r)=>n+BigInt(r.chargedMicros),0n),250n);
    assert.equal((await readWalletUsageSummary(db,'report-company',null,new Date('2026-10-21T21:30:00Z'))).allTimeMicros,'10250');
    const emptySummary=await readWalletUsageSummary(db,'report-company','empty-store',new Date('2026-10-21T21:30:00Z'));assert.equal(emptySummary.allTimeMicros,'0');assert.deepEqual(emptySummary.categories,[]);assert.deepEqual(emptySummary.daily,[]);
    assert.equal((await repository.read('report-company','report-store')).entries.length,100);
    await repository.configure('c',{version:0,enabled:true,emailEnabled:true,notificationOwnerId:'owner'},'admin');
    const funding={amountMicros:'1000000',receiptReference:'synthetic-receipt-1'};
    const credit=await Promise.all([repository.credit('c',funding,'admin'),repository.credit('c',funding,'admin')]);assert.equal(credit[0].id,credit[1].id);assert.equal((await repository.read('c')).balanceMicros,'1000000');
    await assert.rejects(repository.credit('c',{...funding,amountMicros:'2000000'},'admin'),e=>e.code==='AI_WALLET_RECEIPT_CONFLICT');
    await assert.rejects(repository.credit('x',funding,'admin'),e=>e.code==='AI_WALLET_RECEIPT_CONFLICT');
    const reservation=(storeId,amountMicros,reference)=>repository.reserve({companyId:'c',storeId,amountMicros,reference,feature:'SYNTHETIC',tariff:{model:'synthetic'}});
    await assert.rejects(reservation('foreign','100000','foreign-attempt'),e=>e.status===403);
    await assert.rejects(reservation('inactive','100000','inactive-attempt'),e=>e.status===403);
    const races=await Promise.allSettled([reservation('s','600000','request-1'),reservation('s2','600000','request-2')]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.status,402);
    const held=races.find(r=>r.status==='fulfilled').value;
    const usage={inputTokens:1,outputTokens:1};await repository.settle('c',held.id,{amountMicros:'580000',usage});
    assert.equal((await repository.settle('c',held.id,{amountMicros:'580000',usage:{outputTokens:1,inputTokens:1}})).replayed,true);
    await assert.rejects(repository.settle('c',held.id,{amountMicros:'579999',usage}),e=>e.code==='AI_WALLET_SETTLEMENT_CONFLICT');
    const r2=await reservation('s2','420000','request-3');await repository.settle('c',r2.id,{amountMicros:'220000'});
    assert.equal((await repository.read('c')).state,'LOW');
    const r3=await reservation('s','200000','request-4');await repository.settle('c',r3.id,{amountMicros:'100000'});
    const r4=await reservation('s','100000','request-5');await repository.settle('c',r4.id,{amountMicros:'100000'});
    let state=await repository.read('c');assert.equal(state.balanceMicros,'0');assert.equal(state.reservedMicros,'0');assert.equal(state.notices.filter(n=>n.kind==='LOW').length,1);assert.equal(state.notices.filter(n=>n.kind==='EMPTY').length,1);assert.equal(state.notices.filter(n=>n.kind==='CREDIT').length,1);
    assert.equal((await repository.read('c','s')).entries.some(e=>e.storeId==='s2'),false);
    let invoked=0;const provider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([{model:'synthetic',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:0,outputMicrosPerMillion:1000000,contextTokens:10,maxOutputTokens:10}])});
    await assert.rejects(provider({companyId:'c',storeId:'s',feature:'SYNTHETIC'},{model:'synthetic'},async()=>{invoked++}),e=>e.status===402);assert.equal(invoked,0);
    const sent=[];const drain=createWalletNotificationDispatcher({repository,enabled:()=>true,send:async message=>{assert.equal((await db.$queryRaw`SELECT "emailStatus" FROM "AiOwnerWalletNotice" WHERE "emailStatus"='ATTEMPTING'`).length>=1,true);sent.push(message);return {messageId:'synthetic-'+sent.length,accepted:[message.to],rejected:[]}}});
    await Promise.all([drain(),drain()]);assert.equal(sent.length,3);await drain();assert.equal(sent.length,3);
    await repository.credit('c',{amountMicros:'1000000',receiptReference:'synthetic-receipt-2'},'admin');
    const uncertain=createWalletNotificationDispatcher({repository,enabled:()=>true,send:async()=>{throw Error('synthetic timeout')}});await uncertain();assert.equal((await repository.read('c')).notices.filter(n=>n.emailStatus==='UNKNOWN').length,1);await drain();assert.equal(sent.length,3);
    await repository.credit('c',{amountMicros:'100000',receiptReference:'synthetic-receipt-3'},'admin');await db.$executeRaw`UPDATE "User" SET "email"='changed@example.invalid' WHERE "id"='owner'`;await drain();assert.equal(sent.length,3);assert.ok((await repository.read('c')).notices.some(n=>n.emailStatus==='REVOKED'));
    // Invoice adapters use this same actual PostgreSQL ledger and independent
    // AsyncLocalStorage scopes. No real provider or SMTP request is performed.
    const {createInvoiceWalletMeter}=await import('../src/services/ai-wallet-invoice-metering.js');
    const pricing={model:'native-invoice',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:0,outputMicrosPerMillion:1000000,contextTokens:100,maxOutputTokens:20};
    let invoicePaidCalls=0;
    const invoice=createInvoiceWalletMeter({repository,env:{AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_INVOICES_ENABLED:'true',AI_OWNER_WALLET_TARIFFS:JSON.stringify([pricing]),AI_OWNER_WALLET_AZURE_TARIFFS:JSON.stringify([{model:'prebuilt-invoice',apiVersion:'2024-11-30',unitMicros:40,maxPages:5}])},countPages:async()=>2,transport:async()=>{invoicePaidCalls++;return new Response(JSON.stringify({id:'native-invoice-provider-response',model:pricing.model,usage:{input_tokens:5,output_tokens:3,input_tokens_details:{cached_tokens:0}}}))}});
    const tokenCall=()=>invoice.responsesFetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({model:pricing.model,input:'synthetic invoice source'})});
    const sourceBalance=BigInt((await repository.read('c')).balanceMicros);
    await Promise.all([
      invoice.run({companyId:'c',storeId:'s'},tokenCall),
      invoice.run({companyId:'c',storeId:'s2'},()=>invoice.azure({model:'prebuilt-invoice',apiVersion:'2024-11-30'},async mark=>{mark('https://synthetic.invalid/operation/native-invoice');return {status:'succeeded',analyzeResult:{modelId:'prebuilt-invoice',apiVersion:'2024-11-30',pages:[{pageNumber:1},{pageNumber:2}]}}}))
    ]);
    assert.equal(BigInt((await repository.read('c')).balanceMicros),sourceBalance-88n);
    const invoiceRows=await db.$queryRaw`SELECT "storeId","feature","chargedMicros","status" FROM "AiOwnerWalletEntry" WHERE "companyId"='c' AND "feature" IN ('INVOICE_OPENAI','INVOICE_AZURE') ORDER BY "storeId"`;
    assert.deepEqual(invoiceRows.map(r=>[r.storeId,r.feature,String(r.chargedMicros),r.status]),[['s','INVOICE_OPENAI','8','SETTLED'],['s2','INVOICE_AZURE','80','SETTLED']]);
    // Reusing the same provider response cannot debit a second time; the
    // distinct uncertain attempt keeps its reservation for explicit review.
    await assert.rejects(invoice.run({companyId:'c',storeId:'s'},tokenCall),e=>e.code==='AI_WALLET_USAGE_REVIEW'&&e.status===409);
    assert.equal(BigInt((await repository.read('c')).balanceMicros),sourceBalance-88n);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "AiOwnerWalletEntry" WHERE "usage"->>'providerResponseId'='native-invoice-provider-response'`)[0].count,1);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "AiOwnerWalletEntry" WHERE "companyId"='c' AND "feature"='INVOICE_OPENAI' AND "status"='REVIEW'`)[0].count,1);
    await assert.rejects(invoice.run({companyId:'c',storeId:'foreign'},tokenCall),e=>e.status===403);assert.equal(invoicePaidCalls,2);
    await repository.configure('x',{version:0,enabled:true,emailEnabled:false,notificationOwnerId:''},'admin');
    await assert.rejects(invoice.run({companyId:'x',storeId:'foreign'},tokenCall),e=>e.status===402);assert.equal(invoicePaidCalls,2);
    const cachePricing={model:'native-cache-model',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,cacheWriteMicrosPerMillion:{ttl30m:1250000,ttl12h:2500000},contextTokens:20000,maxOutputTokens:5000,longContext:{thresholdTokens:10000,inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:200000,outputMicrosPerMillion:3000000,cacheWriteMicrosPerMillion:{ttl30m:2500000,ttl12h:5000000}}};
    const cacheProvider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([cachePricing])}),beforeCache=BigInt((await repository.read('c')).balanceMicros);
    await cacheProvider({companyId:'c',storeId:'s',feature:'OWNER_ASSISTANT'},{model:cachePricing.model},async()=>({response:{ok:true},raw:{id:'native-cache-response',model:cachePricing.model,usage:{input_tokens:12000,output_tokens:2000,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}}}}));
    const cacheEntry=(await db.$queryRaw`SELECT "reservedMicros","chargedMicros","usage","tariff" FROM "AiOwnerWalletEntry" WHERE "usage"->>'providerResponseId'='native-cache-response'`)[0];
    assert.equal(String(cacheEntry.reservedMicros),'115000');assert.equal(String(cacheEntry.chargedMicros),'36300');assert.equal(cacheEntry.usage.cacheWrite30mTokens,3000);assert.equal(cacheEntry.usage.cacheWrite12hTokens,4000);assert.equal(cacheEntry.usage.pricingTier,'LONG_CONTEXT');assert.equal(cacheEntry.tariff.longContext.thresholdTokens,10000);assert.equal(BigInt((await repository.read('c')).balanceMicros),beforeCache-36300n);
    // Actual SQL rollback after an injected failure in a wallet transaction.
    const wrapped=new Proxy(db,{get(target,key){if(key==='$transaction')return (fn,...options)=>target.$transaction(async tx=>fn(new Proxy(tx,{get(t,k){if(k==='$executeRaw')return async(strings,...values)=>{if(strings.join('').includes('UPDATE "AiOwnerWallet" SET "balanceMicros"="balanceMicros"+'))throw Error('synthetic rollback');return t.$executeRaw(strings,...values)};const v=t[k];return typeof v==='function'?v.bind(t):v}})),...options);const v=target[key];return typeof v==='function'?v.bind(target):v}});
    const failed=createAiOwnerWalletRepository(wrapped);await failed.ensure();const countBefore=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "AiOwnerWalletEntry"`;await assert.rejects(failed.credit('c',{amountMicros:'100000',receiptReference:'must-rollback'},'admin'));assert.deepEqual(await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "AiOwnerWalletEntry"`,countBefore);
    const express=(await import('express')).default,app=express();app.use(express.json());
    const authenticate=(req,res,next)=>{const id=req.headers['x-test-actor'];if(!id)return res.sendStatus(401);req.user={id,sessionId:id+'-session',sessionVersion:1,companyId:'c',tokenType:'BACKOFFICE_USER',role:id==='employee'?'EMPLOYEE':'OWNER',...(id==='admin'?{isSuperAdmin:true,platformRole:'SUPER_ADMIN'}:{})};next()};
    const activationEnv={OPENAI_COMMAND_CENTER_MODEL:'synthetic-activation-model'};
    app.use('/wallet',createAiOwnerWalletRoutes({db,repository,authenticate,access:createWalletAccess(db),enabled:()=>true,env:activationEnv}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/wallet`;
    const request=async(path,actor='owner',method='GET',body)=>{const r=await fetch(base+path,{method,headers:{...(actor?{'x-test-actor':actor}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:r.status===401?null:await r.json()}};
    const ownerRead=await request('/stores/s');assert.equal(ownerRead.status,200);assert.equal(ownerRead.body.usageSummary.timeZone,'Europe/Athens');assert.ok(ownerRead.body.usageSummary.categories.every(r=>['INVOICES','OTHER','QUESTIONS'].includes(r.category)));assert.ok(ownerRead.body.usageSummary.categories.some(r=>r.category==='QUESTIONS'&&r.allTimeMicros==='36300'));assert.equal((await request('/stores/s',null)).status,401);assert.equal((await request('/stores/s','employee')).status,403);assert.equal((await request('/stores/foreign')).status,404);
    assert.equal((await request('/platform/companies/c')).status,403);
    // Prisma enum filters cast to this isolated schema's native UserRole type,
    // exactly as in production. A text-only fixture cannot exercise this read.
    assert.equal((await db.user.findMany({where:{companyId:'c',role:'OWNER',mustChangePassword:false},select:{id:true}})).length,1);
    const adminRead=await request('/platform/companies/c','admin');assert.equal(adminRead.status,200,JSON.stringify(adminRead.body));
    // Real HTTP + native SQL: unsafe activation must have no wallet/audit delta;
    // disabling stays available even when provider configuration is unavailable.
    assert.equal(adminRead.body.activationReadiness.model,activationEnv.OPENAI_COMMAND_CENTER_MODEL);
    assert.equal(adminRead.body.activationReadiness.ready,false);
    const offConfig=await request('/platform/companies/c','admin','PUT',{version:adminRead.body.version,enabled:false,emailEnabled:false,notificationOwnerId:''});
    assert.equal(offConfig.status,200);assert.equal((await repository.read('c')).enabled,false);
    const beforeActivation=await repository.read('c'),walletBeforeActivation=await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='c'`,auditBeforeActivation=await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='c' ORDER BY "id"`;
    const enableConfig={version:beforeActivation.version,enabled:true,emailEnabled:false,notificationOwnerId:''};
    assert.equal((await request('/platform/companies/c','admin','PUT',enableConfig)).body.code,'AI_WALLET_PROVIDER_REQUIRED');
    activationEnv.OPENAI_API_KEY='synthetic-private-provider-key';activationEnv.AI_OWNER_WALLET_TARIFFS='invalid';
    const missingPrice=await request('/platform/companies/c','admin','PUT',enableConfig);assert.equal(missingPrice.status,503);assert.equal(missingPrice.body.code,'AI_WALLET_TARIFF_REQUIRED');
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='c'`,walletBeforeActivation);
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='c' ORDER BY "id"`,auditBeforeActivation);
    activationEnv.AI_OWNER_WALLET_TARIFFS=JSON.stringify([{model:activationEnv.OPENAI_COMMAND_CENTER_MODEL,inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,contextTokens:20000,maxOutputTokens:8192}]);
    const readyRead=await request('/platform/companies/c','admin');assert.equal(readyRead.body.activationReadiness.ready,true);assert.doesNotMatch(JSON.stringify(readyRead.body),/synthetic-private-provider-key/);
    assert.equal((await request('/platform/companies/c','owner','PUT',enableConfig)).status,403);
    const enabledConfig=await request('/platform/companies/c','admin','PUT',enableConfig);assert.equal(enabledConfig.status,200);assert.equal((await repository.read('c')).enabled,true);

    // New in-app invoice policy: real HTTP authorization + native row-locked
    // audit/version persistence, with no external providers or business writes.
    await db.$executeRaw`INSERT INTO "Company" VALUES('invoice-switch','Synthetic invoice switch',true)`;
    await db.$executeRaw`INSERT INTO "Store" VALUES('invoice-switch-store','Synthetic switch store','invoice-switch',true)`;
    await repository.configure('invoice-switch',{version:0,enabled:true,emailEnabled:false,notificationOwnerId:''},'admin');
    Object.assign(activationEnv,{
      AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_INVOICES_ENABLED:'true',AI_OWNER_WALLET_INVOICE_COMPANIES:'[]',
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'synthetic-private-azure-endpoint',AZURE_DOCUMENT_INTELLIGENCE_KEY:'synthetic-private-azure-key',
      OPENAI_INVOICE_MODEL:activationEnv.OPENAI_COMMAND_CENTER_MODEL,OPENAI_INVOICE_FAST_MODEL:activationEnv.OPENAI_COMMAND_CENTER_MODEL,
      OPENAI_INVOICE_FULL_MODEL:activationEnv.OPENAI_COMMAND_CENTER_MODEL,OPENAI_INVOICE_ASSISTANT_MODEL:activationEnv.OPENAI_COMMAND_CENTER_MODEL,
      AI_OWNER_WALLET_INVOICE_TARIFFS:JSON.stringify([{model:activationEnv.OPENAI_COMMAND_CENTER_MODEL,inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,contextTokens:400000,maxOutputTokens:128000}]),
      AI_OWNER_WALLET_INVOICE_AZURE_TARIFFS:JSON.stringify([{model:'prebuilt-invoice',apiVersion:'2024-11-30',unitMicros:13200,maxPages:5}])
    });
    const switchPath='/platform/companies/invoice-switch',switchRead=()=>request(switchPath,'admin');
    let switchState=(await switchRead()).body;
    assert.equal(switchState.invoiceBilling.enabled,false);assert.equal(switchState.invoiceBilling.readiness.ready,true);
    assert.doesNotMatch(JSON.stringify(switchState),/synthetic-private-/);
    const switchInput=()=>({version:switchState.version,enabled:true,emailEnabled:false,notificationOwnerId:'',invoiceEnabled:true});
    for(const actor of ['owner','employee'])assert.equal((await request(switchPath,actor,'PUT',switchInput())).status,403);
    assert.equal((await request('/platform/companies/missing','admin','PUT',switchInput())).status,404);
    assert.equal((await request(switchPath,'admin','PUT',{...switchInput(),invoiceEnabled:'true'})).status,400);
    const switchControl=async()=>({wallet:await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='invoice-switch'`,entries:await db.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "companyId"='invoice-switch'`,notices:await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='invoice-switch'`,audits:await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='invoice-switch' ORDER BY "id"`});
    const switchBefore=await switchControl();
    assert.equal((await request(switchPath,'admin','PUT',switchInput())).status,200);
    switchState=(await switchRead()).body;assert.equal(switchState.invoiceBilling.enabled,true);assert.equal(switchState.invoiceBilling.active,true);
    assert.ok(switchState.meteredFeatures.includes('INVOICE_OPENAI'));assert.equal(switchState.serviceConfiguration.invoices.enabled,true);
    let switchAfter=await switchControl();assert.equal(switchAfter.audits.length,switchBefore.audits.length+1);
    assert.equal(switchAfter.wallet[0].version,switchBefore.wallet[0].version+1);assert.deepEqual(switchAfter.entries,switchBefore.entries);assert.deepEqual(switchAfter.notices,switchBefore.notices);
    assert.equal(switchAfter.wallet[0].balanceMicros,switchBefore.wallet[0].balanceMicros);assert.equal(switchAfter.wallet[0].reservedMicros,switchBefore.wallet[0].reservedMicros);
    // Omitted-field clients cannot silently erase a newer explicit decision.
    const omitted=switchInput();delete omitted.invoiceEnabled;
    assert.equal((await request(switchPath,'admin','PUT',omitted)).status,200);switchState=(await switchRead()).body;assert.equal(switchState.invoiceBilling.enabled,true);
    const raced={...switchInput(),invoiceEnabled:false},auditCount=(await switchControl()).audits.length;
    const races2=await Promise.all([request(switchPath,'admin','PUT',raced),request(switchPath,'admin','PUT',raced)]);
    assert.deepEqual(races2.map(r=>r.status).sort(),[200,409]);assert.equal((await switchControl()).audits.length,auditCount+1);
    activationEnv.AI_OWNER_WALLET_INVOICE_COMPANIES='["invoice-switch"]';
    switchState=(await switchRead()).body;assert.equal(switchState.invoiceBilling.enabled,false);
    assert.equal(await repository.invoiceEnabledFor('invoice-switch',true),false);assert.equal(await repository.invoiceEnabledFor('c',true),true);
    // Invalid enable is all-or-nothing; disable remains possible even if the
    // existing Owner/provider configuration is temporarily unavailable.
    const validInvoicePrices=activationEnv.AI_OWNER_WALLET_INVOICE_TARIFFS;
    activationEnv.AI_OWNER_WALLET_INVOICE_TARIFFS='invalid';
    const invalidBefore=await switchControl();assert.equal((await request(switchPath,'admin','PUT',switchInput())).body.code,'AI_WALLET_INVOICE_TARIFF_REQUIRED');assert.deepEqual(await switchControl(),invalidBefore);
    activationEnv.AI_OWNER_WALLET_INVOICE_TARIFFS=validInvoicePrices;
    assert.equal((await request(switchPath,'admin','PUT',switchInput())).status,200);
    await repository.grantTrial('invoice-switch',{amountMicros:'1000',grantReference:'synthetic-switch-hold',reason:'Synthetic native pending hold control'},'admin');
    const pendingInvoice=await repository.reserve({companyId:'invoice-switch',storeId:'invoice-switch-store',feature:'INVOICE_OPENAI',invoicePolicyFallback:false,amountMicros:'10',reference:'synthetic-switch-pending',tariff:{model:'synthetic-original'}});
    switchState=(await switchRead()).body;assert.equal(switchState.reservedMicros,'10');
    const validProviderKey=activationEnv.OPENAI_API_KEY;activationEnv.OPENAI_API_KEY='';
    assert.equal((await request(switchPath,'admin','PUT',{...switchInput(),invoiceEnabled:false})).status,200);
    switchState=(await switchRead()).body;assert.equal(switchState.enabled,true);assert.equal(switchState.invoiceBilling.enabled,false);assert.equal(switchState.reservedMicros,'10');
    assert.equal(await repository.reserve({companyId:'invoice-switch',storeId:'invoice-switch-store',feature:'INVOICE_AZURE',invoicePolicyFallback:true,amountMicros:'1',reference:'synthetic-switch-late',tariff:{}}),null);
    await repository.settle('invoice-switch',pendingInvoice.id,{amountMicros:'8',usage:{synthetic:true}});
    switchState=(await switchRead()).body;assert.equal(switchState.balanceMicros,'992');assert.equal(switchState.reservedMicros,'0');
    activationEnv.OPENAI_API_KEY=validProviderKey;
    // Deliberately reverse timestamps in this isolated fixture: wallet version
    // remains the source of configuration order, not transaction start time.
    await db.$executeRaw`UPDATE "AiOwnerWalletAudit" SET "createdAt"=CASE WHEN ("detail"->>'invoiceEnabled')::boolean THEN '2100-01-01'::timestamptz ELSE '2000-01-01'::timestamptz END WHERE "companyId"='invoice-switch' AND "detail" ? 'invoiceEnabled'`;
    assert.equal(await repository.invoiceEnabledFor('invoice-switch',true),false);
    await db.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},'invoice-switch','admin','CONFIGURED','{"version":999999,"invoiceEnabled":"invalid"}'::jsonb)`;
    await assert.rejects(repository.invoiceEnabledFor('invoice-switch',true),e=>e.code==='AI_WALLET_INVOICE_CONFIG_INVALID');

    // Safe diagnostic audit is bound to the original held entry, written once
    // atomically with REVIEW and never changes company money or business data.
    await db.$executeRaw`INSERT INTO "Company" VALUES('review-proof','Synthetic review evidence',true)`;
    await db.$executeRaw`INSERT INTO "Store" VALUES('review-proof-store','Synthetic evidence store','review-proof',true)`;
    await repository.configure('review-proof',{version:0,enabled:true,emailEnabled:false,notificationOwnerId:''},'admin');
    await repository.grantTrial('review-proof',{amountMicros:'100000',grantReference:'synthetic-review-proof',reason:'Synthetic diagnostic evidence control'},'admin');
    const reviewHold=await repository.reserve({companyId:'review-proof',storeId:'review-proof-store',feature:'OWNER_ASSISTANT',amountMicros:'10',reference:'synthetic-review-original',tariff:{model:'synthetic-review-model'}});
    const reviewControls=async()=>({wallet:await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='review-proof'`,entries:await db.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "companyId"='review-proof' ORDER BY "id"`,notices:await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='review-proof'`,audits:await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='review-proof' ORDER BY "id"`,foreign:await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='c'`});
    const reviewBefore=await reviewControls(),diagnostic={stage:'USAGE',reason:'USAGE_INVALID',responseId:'resp_synthetic_native',model:'synthetic-review-model',reported:{inputTokens:100,outputTokens:5},presence:{inputTokens:'VALID',outputTokens:'VALID',cacheWriteTokens:'MISSING'},limits:{inputTokens:100,outputTokens:30000},secret:'SECRET_native_prompt',headers:{Authorization:'SECRET_native_token'}};
    await Promise.all([repository.review('review-proof',reviewHold.id,diagnostic),repository.review('review-proof',reviewHold.id,diagnostic)]);
    const reviewAfter=await reviewControls();assert.deepEqual(reviewAfter.wallet,reviewBefore.wallet);assert.deepEqual(reviewAfter.notices,reviewBefore.notices);assert.deepEqual(reviewAfter.foreign,reviewBefore.foreign);
    assert.equal(reviewAfter.audits.length,reviewBefore.audits.length+1);const evidenceAudit=reviewAfter.audits.find(x=>x.event==='USAGE_REVIEW');assert.equal(evidenceAudit.actorId,'SYSTEM_AI_METER');assert.equal(evidenceAudit.detail.id,reviewHold.id);assert.equal(evidenceAudit.detail.evidence.reported.inputTokens,100);assert.equal(evidenceAudit.detail.evidence.presence.cacheWriteTokens,'MISSING');assert.doesNotMatch(JSON.stringify(evidenceAudit),/SECRET|Authorization/);
    assert.deepEqual(reviewAfter.entries,reviewBefore.entries.map(x=>x.id===reviewHold.id?{...x,status:'REVIEW'}:x));
    await repository.review('c',reviewHold.id,diagnostic);assert.deepEqual(await reviewControls(),reviewAfter);
    const reviewRollbackHold=await repository.reserve({companyId:'review-proof',storeId:'review-proof-store',feature:'OWNER_ASSISTANT',amountMicros:'10',reference:'synthetic-review-rollback',tariff:{}}),reviewRollbackBefore=await reviewControls();
    const reviewFailureDb=new Proxy(db,{get(t,k){if(k==='$transaction')return fn=>t.$transaction(tx=>fn(new Proxy(tx,{get(a,b){if(b==='$executeRaw')return (ss,...v)=>{if(ss.join('').includes('INSERT INTO "AiOwnerWalletAudit"'))throw Error('synthetic diagnostic audit rollback');return a.$executeRaw(ss,...v)};const x=a[b];return typeof x==='function'?x.bind(a):x}})));const x=t[k];return typeof x==='function'?x.bind(t):x}});
    await assert.rejects(createAiOwnerWalletRepository(reviewFailureDb).review('review-proof',reviewRollbackHold.id,diagnostic),/synthetic diagnostic audit rollback/);assert.deepEqual(await reviewControls(),reviewRollbackBefore);

    // Explicit provider zero writes is a complete zero partition even when
    // the provider omits the optional lifetime-detail object.
    const nativeZeroTariff={model:'synthetic-zero-write',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,cacheWriteMicrosPerMillion:{ttl30m:1250000,ttl12h:2500000},contextTokens:20000,maxOutputTokens:5000};
    const nativeZeroBefore=await reviewControls(),nativeZeroProvider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([nativeZeroTariff])});
    await nativeZeroProvider({companyId:'review-proof',storeId:'review-proof-store',feature:'INVOICE_OPENAI'},{model:nativeZeroTariff.model,max_output_tokens:3000},async()=>({response:{ok:true},raw:{id:'resp_synthetic_native_zero',model:nativeZeroTariff.model,usage:{input_tokens:100,output_tokens:5,input_tokens_details:{cached_tokens:20,cache_write_tokens:0}}}}),async()=>100);
    const nativeZeroAfter=await reviewControls(),nativeZeroEntry=nativeZeroAfter.entries.find(x=>x.usage?.providerResponseId==='resp_synthetic_native_zero');
    assert.equal(nativeZeroAfter.wallet[0].balanceMicros,nativeZeroBefore.wallet[0].balanceMicros-92n);assert.equal(nativeZeroAfter.wallet[0].reservedMicros,nativeZeroBefore.wallet[0].reservedMicros);assert.equal(nativeZeroAfter.wallet[0].version,nativeZeroBefore.wallet[0].version+2);assert.equal(nativeZeroEntry.status,'SETTLED');assert.equal(nativeZeroEntry.chargedMicros,92n);assert.equal(nativeZeroEntry.usage.cacheWriteTokens,0);assert.equal(nativeZeroEntry.usage.cacheWrite30mTokens,0);assert.equal(nativeZeroEntry.usage.cacheWrite12hTokens,0);assert.deepEqual(nativeZeroAfter.audits,nativeZeroBefore.audits);assert.deepEqual(nativeZeroAfter.notices,nativeZeroBefore.notices);assert.deepEqual(nativeZeroAfter.foreign,nativeZeroBefore.foreign);

    // Actual observed positive aggregate shape: known default lifetime is
    // snapshotted with the original hold; old REVIEW/RESERVED holds survive.
    const nativeUniformTariff={...nativeZeroTariff,model:'synthetic-uniform-write',contextTokens:40000,maxOutputTokens:40000};
    const nativeUniformBefore=await reviewControls(),nativeUniformProvider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([nativeUniformTariff])});
    const nativeUniformResult={response:{ok:true},raw:{id:'resp_synthetic_native_uniform',model:nativeUniformTariff.model,usage:{input_tokens:9399,output_tokens:778,input_tokens_details:{cached_tokens:0,cache_write_tokens:9396}}}};
    assert.equal(await nativeUniformProvider({companyId:'review-proof',storeId:'review-proof-store',feature:'INVOICE_OPENAI'},{model:nativeUniformTariff.model,input:'Synthetic uniform lifetime',max_output_tokens:30000},async()=>nativeUniformResult,async()=>9399),nativeUniformResult);
    const nativeUniformAfter=await reviewControls(),nativeUniformEntry=nativeUniformAfter.entries.find(x=>x.usage?.providerResponseId==='resp_synthetic_native_uniform');
    assert.equal(nativeUniformAfter.wallet[0].balanceMicros,nativeUniformBefore.wallet[0].balanceMicros-13304n);assert.equal(nativeUniformAfter.wallet[0].reservedMicros,nativeUniformBefore.wallet[0].reservedMicros);assert.equal(nativeUniformAfter.wallet[0].version,nativeUniformBefore.wallet[0].version+2);
    assert.equal(nativeUniformAfter.entries.length,nativeUniformBefore.entries.length+1);assert.equal(nativeUniformEntry.status,'SETTLED');assert.equal(nativeUniformEntry.reservedMicros,83498n);assert.equal(nativeUniformEntry.chargedMicros,13304n);assert.equal(nativeUniformEntry.usage.cacheWrite30mTokens,9396);assert.equal(nativeUniformEntry.usage.cacheWrite12hTokens,0);assert.equal(nativeUniformEntry.usage.cacheWritePartitionSource,'REQUEST_DEFAULT');assert.deepEqual(nativeUniformEntry.tariff.requestCacheWritePolicy,{schemaVersion:1,state:'UNIFORM',ttl:'30m',source:'REQUEST_DEFAULT'});
    assert.deepEqual(nativeUniformAfter.entries.filter(x=>x.id!==nativeUniformEntry.id),nativeUniformBefore.entries);assert.deepEqual(nativeUniformAfter.audits,nativeUniformBefore.audits);assert.deepEqual(nativeUniformAfter.notices,nativeUniformBefore.notices);assert.deepEqual(nativeUniformAfter.foreign,nativeUniformBefore.foreign);

    // Internal trial funding never claims a customer receipt. Separate company
    // controls protect all existing fixture counts and real business rows.
    await db.$executeRaw`INSERT INTO "Company" VALUES('trial','Synthetic internal trial',true)`;
    await db.$executeRaw`INSERT INTO "Store" VALUES('trial-store','Synthetic trial store','trial',true)`;
    const grant={amountMicros:'5000000',grantReference:'synthetic-trial-grant',reason:'Synthetic approved internal trial'};
    const granted=await Promise.all([repository.grantTrial('trial',grant,'admin'),repository.grantTrial('trial',grant,'admin')]);
    assert.equal(granted[0].id,granted[1].id);assert.equal(granted.filter(r=>r.replayed).length,1);
    const trialBefore=await repository.read('trial','trial-store');assert.equal(trialBefore.balanceMicros,'5000000');assert.equal(trialBefore.enabled,false);assert.equal(trialBefore.entries.length,1);assert.equal(trialBefore.entries[0].feature,'TRIAL_GRANT');assert.equal(trialBefore.notices.length,1);assert.equal(trialBefore.usageSummary.allTimeMicros,'0');
    const audit=(await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='trial' AND "event"='TRIAL_GRANTED'`);assert.equal(audit.length,1);assert.equal(audit[0].actorId,'admin');assert.equal(audit[0].detail.amountMicros,'5000000');assert.equal(audit[0].detail.fundingType,'TRIAL_GRANT');assert.equal(audit[0].detail.receiptConfirmed,undefined);
    for(const input of [{...grant,amountMicros:'4000000'},{...grant,reason:'Different approved internal reason'}])await assert.rejects(repository.grantTrial('trial',input,'admin'),e=>e.code==='AI_WALLET_TRIAL_CONFLICT');
    await assert.rejects(repository.grantTrial('x',grant,'admin'),e=>e.code==='AI_WALLET_TRIAL_CONFLICT');
    await assert.rejects(repository.credit('trial',{amountMicros:'5000000',receiptReference:'TRIAL/SYNTHETIC-TRIAL-GRANT'},'admin'),e=>e.code==='AI_WALLET_RESERVED_REFERENCE');
    await assert.rejects(repository.grantTrial('trial',{...grant,grantReference:'invalid-zero',amountMicros:'0'},'admin'));
    // Inject at the last notice write: entry, balance and audit must all roll back.
    const noticeFailDb=new Proxy(db,{get(t,k){if(k==='$transaction')return fn=>t.$transaction(tx=>fn(new Proxy(tx,{get(a,b){if(b==='$executeRaw')return (ss,...v)=>{if(ss.join('').includes('INSERT INTO "AiOwnerWalletNotice"'))throw Error('synthetic notice rollback');return a.$executeRaw(ss,...v)};const x=a[b];return typeof x==='function'?x.bind(a):x}})));const x=t[k];return typeof x==='function'?x.bind(t):x}});
    await assert.rejects(createAiOwnerWalletRepository(noticeFailDb).grantTrial('trial',{...grant,grantReference:'rollback-trial'},'admin'),/synthetic notice rollback/);
    const trialAfterRollback=await repository.read('trial');assert.equal(trialAfterRollback.balanceMicros,trialBefore.balanceMicros);assert.equal(trialAfterRollback.version,trialBefore.version);assert.equal(trialAfterRollback.entries.length,1);assert.equal(trialAfterRollback.notices.length,1);assert.equal((await db.$queryRaw`SELECT "id" FROM "AiOwnerWalletAudit" WHERE "companyId"='trial'`).length,1);
    await repository.configure('trial',{version:trialAfterRollback.version,enabled:true,emailEnabled:false,notificationOwnerId:''},'admin');
    const pendingTrial=await repository.reserve({companyId:'trial',storeId:'trial-store',feature:'OWNER_ASSISTANT',amountMicros:'10',reference:'trial-pre-disable',tariff:{model:'synthetic'}});
    const activeTrial=await repository.read('trial');await repository.configure('trial',{version:activeTrial.version,enabled:false,emailEnabled:false,notificationOwnerId:''},'admin');
    let platformCalls=0;const offProvider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>{throw Error('OFF must not need tariffs')}}),offSettings={model:'unchanged-platform-model',input:'not retained'};
    assert.equal(await offProvider({companyId:'trial',storeId:'trial-store'},offSettings,async settings=>{assert.equal(settings,offSettings);platformCalls++;return 'original-result'}),'original-result');assert.equal(platformCalls,1);
    const offTrial=await repository.read('trial');assert.equal(offTrial.balanceMicros,'5000000');assert.equal(offTrial.reservedMicros,'10');assert.equal(offTrial.entries.length,2);
    await repository.settle('trial',pendingTrial.id,{amountMicros:'8',usage:{synthetic:true}});assert.equal((await repository.read('trial')).balanceMicros,'4999992');assert.equal((await repository.read('trial')).reservedMicros,'0');
    await assert.rejects(repository.configure('trial',{version:activeTrial.version,enabled:true,emailEnabled:false,notificationOwnerId:''},'admin'),e=>e.code==='AI_WALLET_CHANGED');
    const trialRequest={...grant,grantReference:'synthetic-http-trial',trialConfirmed:true};
    for(const actor of ['owner','employee'])assert.equal((await request('/platform/companies/trial/trial-grants',actor,'POST',trialRequest)).status,403);
    assert.equal((await request('/platform/companies/trial/trial-grants','admin','POST',{...trialRequest,trialConfirmed:false})).status,400);
    assert.equal((await request('/platform/companies/trial/trial-grants','admin','POST',{...trialRequest,receiptConfirmed:true})).status,400);
    assert.equal((await request('/platform/companies/missing/trial-grants','admin','POST',trialRequest)).status,404);
    const httpGrant=await request('/platform/companies/trial/trial-grants','admin','POST',trialRequest);assert.equal(httpGrant.status,200,JSON.stringify(httpGrant.body));
    assert.equal((await request('/platform/companies/trial/trial-grants','admin','POST',trialRequest)).body.id,httpGrant.body.id);
    await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='admin-session'`;assert.equal((await request('/platform/companies/trial/trial-grants','admin','POST',{...trialRequest,grantReference:'revoked-trial'})).status,401);await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='admin-session'`;
    assert.equal((await request('/platform/companies/c/credits','owner','POST',{amountMicros:'10000',receiptReference:'forbidden',receiptConfirmed:true})).status,403);
    assert.equal((await request('/platform/companies/c/credits','admin','POST',{amountMicros:'10000',receiptReference:'unconfirmed',receiptConfirmed:false})).status,400);
    await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='owner-session'`;assert.equal((await request('/stores/s')).status,401);
    await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='owner-session'`;await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`;assert.equal((await request('/stores/s')).status,403);
    // A shared owner belongs directly to x but has explicit access to shared.
    // Exercise actual HTTP listing/configuration and SQL enqueue/dispatch,
    // including revocation at BOTH boundaries. No real SMTP/provider I/O.
    await db.$executeRaw`INSERT INTO "Company" VALUES('shared','Shared ownership',true)`;
    await db.$executeRaw`INSERT INTO "User" VALUES('shared-owner','shared@example.invalid','Shared owner','OWNER','x',1,false),('foreign-owner','foreign@example.invalid','Foreign owner','OWNER','x',1,false)`;
    await db.$executeRaw`INSERT INTO "OwnerCompanyAccess" VALUES('shared-owner','shared')`;
    const sharedRead=()=>request('/platform/companies/shared','admin');
    assert.deepEqual((await sharedRead()).body.owners.map(o=>o.id),['shared-owner']);
    let sharedWallet=(await sharedRead()).body;
    const sharedConfig={version:sharedWallet.version,enabled:false,emailEnabled:true,notificationOwnerId:'shared-owner'};
    assert.equal((await request('/platform/companies/shared','admin','PUT',{...sharedConfig,notificationOwnerId:'foreign-owner'})).body.code,'AI_WALLET_OWNER_REQUIRED');
    assert.equal((await request('/platform/companies/shared','admin','PUT',sharedConfig)).status,200);
    const sharedMessages=[];
    const sharedDrain=createWalletNotificationDispatcher({repository,enabled:()=>true,send:async message=>{if(message.companyId==='shared')sharedMessages.push(message);return {messageId:'synthetic-shared-'+randomUUID(),accepted:[message.to],rejected:[]}}});
    await repository.credit('shared',{amountMicros:'10000',receiptReference:'shared-synthetic-1'},'admin');
    assert.equal((await db.$queryRaw`SELECT "emailStatus" FROM "AiOwnerWalletNotice" WHERE "companyId"='shared'`)[0].emailStatus,'PENDING');
    await sharedDrain();await sharedDrain();assert.equal(sharedMessages.length,1);assert.equal(sharedMessages[0].to,'shared@example.invalid');
    await repository.credit('shared',{amountMicros:'10000',receiptReference:'shared-synthetic-2'},'admin');
    await db.$executeRaw`DELETE FROM "OwnerCompanyAccess" WHERE "ownerId"='shared-owner' AND "companyId"='shared'`;
    await sharedDrain();assert.equal(sharedMessages.length,1);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "AiOwnerWalletNotice" WHERE "companyId"='shared' AND "emailStatus"='REVOKED'`)[0].n,1);
    assert.deepEqual((await sharedRead()).body.owners,[]);
    sharedWallet=(await sharedRead()).body;
    assert.equal((await request('/platform/companies/shared','admin','PUT',{...sharedConfig,version:sharedWallet.version})).body.code,'AI_WALLET_OWNER_REQUIRED');
    await repository.credit('shared',{amountMicros:'10000',receiptReference:'shared-synthetic-3'},'admin');
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "AiOwnerWalletNotice" WHERE "companyId"='shared' AND "emailStatus"='DISABLED'`)[0].n,1);
    await db.$executeRaw`INSERT INTO "OwnerCompanyAccess" VALUES('shared-owner','shared')`;
    await sharedDrain();assert.equal(sharedMessages.length,1); // never revive old notices
    sharedWallet=(await sharedRead()).body; // credits advanced the optimistic version
    for(const sql of [
      `UPDATE "User" SET "mustChangePassword"=TRUE WHERE "id"='shared-owner'`,
      `UPDATE "User" SET "mustChangePassword"=FALSE,"role"='EMPLOYEE' WHERE "id"='shared-owner'`
    ]){
      await db.$executeRawUnsafe(sql);assert.deepEqual((await sharedRead()).body.owners,[]);
      assert.equal((await request('/platform/companies/shared','admin','PUT',{...sharedConfig,version:sharedWallet.version})).body.code,'AI_WALLET_OWNER_REQUIRED');
    }
    // Customer prices use the actual wallet lock/HTTP authorization, not a
    // simulated ledger. Invoice identity is an authorized durable draft.
    await db.$executeRaw`CREATE TABLE "PurchaseDocument" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"sourceType" text)`;
    await db.$executeRaw`CREATE TABLE "PurchaseOrder" ("id" text PRIMARY KEY,"companyId" text,"sourceDocumentId" text,"status" text,"sourceType" text)`;
    await db.$executeRaw`INSERT INTO "Company" VALUES ('pricing','Synthetic pricing',true)`;
    await db.$executeRaw`INSERT INTO "Store" VALUES ('pricing-store','Synthetic pricing store','pricing',true)`;
    await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('pricing-d1','pricing','pricing-store','DRAFT','POS_OCR_DRAFT'),('pricing-d2','pricing','pricing-store','DRAFT','POS_OCR_DRAFT'),('foreign-doc','x','foreign','DRAFT','POS_OCR_DRAFT')`;
    await db.$executeRaw`INSERT INTO "PurchaseOrder" VALUES ('pricing-o1','pricing','pricing-d1','NEW','POS_OCR_DRAFT'),('pricing-o2','pricing','pricing-d2','NEW','POS_OCR_DRAFT'),('foreign-order','x','foreign-doc','NEW','POS_OCR_DRAFT')`;
    const pricingPath='/platform/companies/pricing/pricing',policy={additionalMarkupBps:2500,callFeeMicros:'20',invoiceFeeMicros:'100'};
    const priceInput={version:0,policy,additionalTariffConfirmed:true};
    assert.equal((await request(pricingPath,'owner','PUT',priceInput)).status,403);
    assert.equal((await request(pricingPath,'admin','PUT',{...priceInput,additionalTariffConfirmed:false})).status,400);
    assert.equal((await request(pricingPath,'admin','PUT',{...priceInput,policy:{...policy,unexpected:1}})).status,400);
    assert.equal((await request(pricingPath,'admin','PUT',priceInput)).status,200);
    assert.equal((await request(pricingPath,'admin','PUT',priceInput)).body.code,'AI_WALLET_CHANGED');
    let pw=await repository.read('pricing');assert.equal(pw.enabled,false);assert.equal(pw.balanceMicros,'0');assert.equal(pw.entries.length,0);assert.equal(pw.notices.length,0);assert.deepEqual(pw.customerPricing,{version:1,...policy});
    await repository.configure('pricing',{version:pw.version,enabled:true,emailEnabled:false,notificationOwnerId:'',invoiceEnabled:true},'admin');
    await repository.credit('pricing',{amountMicros:'10000',receiptReference:'pricing-synthetic-funding'},'admin');
    const pricedReserve=(document,reference)=>repository.reserve({companyId:'pricing',storeId:'pricing-store',feature:'INVOICE_OPENAI',tariff:{model:'synthetic'},amountMicros:'100',invoiceDocumentId:document,reference});
    await assert.rejects(pricedReserve('foreign-doc','pricing-forbidden'),e=>e.code==='AI_WALLET_SCOPE_DENIED');
    const pair=await Promise.all([pricedReserve('pricing-d1','pricing-concurrent-1'),pricedReserve('pricing-d1','pricing-concurrent-2')]);
    assert.deepEqual(pair.map(x=>x.reservedMicros).sort(),['145','245']);
    const originalEntries=await db.$queryRaw`SELECT "id","tariff" FROM "AiOwnerWalletEntry" WHERE "companyId"='pricing' AND "kind"='USAGE'`;
    assert.equal(originalEntries.filter(x=>x.tariff.customerPricing.invoiceFeeClaimed).length,1);
    pw=await repository.read('pricing');const changed={additionalMarkupBps:10000,callFeeMicros:'30',invoiceFeeMicros:'200'};
    const configRaces=await Promise.all([request(pricingPath,'admin','PUT',{version:pw.version,policy:changed,additionalTariffConfirmed:true}),request(pricingPath,'admin','PUT',{version:pw.version,policy:changed,additionalTariffConfirmed:true})]);
    assert.deepEqual(configRaces.map(x=>x.status).sort(),[200,409]);
    for(const reservation of pair)await repository.settle('pricing',reservation.id,{amountMicros:'40',usage:{inputTokens:40,outputTokens:0}});
    const settled=await db.$queryRaw`SELECT "id","chargedMicros","usage" FROM "AiOwnerWalletEntry" WHERE "companyId"='pricing' AND "kind"='USAGE'`;
    assert.deepEqual(settled.map(x=>String(x.chargedMicros)).sort(),['170','70']);
    assert.equal((await repository.settle('pricing',pair[0].id,{amountMicros:'40',usage:{outputTokens:0,inputTokens:40}})).replayed,true);
    await assert.rejects(repository.settle('pricing',pair[0].id,{amountMicros:'41',usage:{inputTokens:41,outputTokens:0}}),e=>e.code==='AI_WALLET_SETTLEMENT_CONFLICT');
    const again=await pricedReserve('pricing-d1','pricing-followup');assert.equal(again.reservedMicros,'230');await repository.settle('pricing',again.id,{amountMicros:'40',usage:{}});
    const uncertain=await pricedReserve('pricing-d2','pricing-uncertain');assert.equal(uncertain.reservedMicros,'430');await repository.review('pricing',uncertain.id);
    const afterReview=await pricedReserve('pricing-d2','pricing-after-review');assert.equal(afterReview.reservedMicros,'230');
    await repository.settle('pricing',uncertain.id,{amountMicros:'123',actorId:'admin',resolutionReference:'pricing-confirmed-final',usage:{reviewReference:'confirmed-final'}});
    await repository.settle('pricing',afterReview.id,{amountMicros:'40',usage:{}});
    pw=await repository.read('pricing');assert.equal(pw.balanceMicros,'9417');assert.equal(pw.reservedMicros,'0');
    assert.equal(pw.entries.find(e=>e.id===uncertain.id).customerCharge,null);assert.ok(pw.entries.some(e=>e.customerCharge?.invoiceFeeMicros==='100'));
    assert.equal((await repository.read('x')).customerPricing.callFeeMicros,'0');
    const high={additionalMarkupBps:0,callFeeMicros:'10000',invoiceFeeMicros:'0'};
    await repository.configurePricing('pricing',{version:pw.version,policy:high},'admin');
    let paidCalls=0;const pricedProvider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([{model:'synthetic',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:0,outputMicrosPerMillion:1000000,contextTokens:100,maxOutputTokens:20}])});
    await assert.rejects(pricedProvider({companyId:'pricing',storeId:'pricing-store',feature:'OWNER_ASSISTANT'},{model:'synthetic'},async()=>{paidCalls++;throw Error('must not call')}),e=>e.code==='AI_WALLET_INSUFFICIENT');assert.equal(paidCalls,0);
    assert.equal((await repository.read('pricing')).balanceMicros,pw.balanceMicros);assert.equal((await repository.read('pricing')).entries.length,pw.entries.length);
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "BusinessControl"`,before);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});


