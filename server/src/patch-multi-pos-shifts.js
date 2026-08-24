import fs from "fs";

const patch=(relativePath,changes)=>{
  const path=new URL(relativePath,import.meta.url);
  let src=fs.readFileSync(path,"utf8"),changed=false;
  for(const {label,from,to} of changes){
    if(src.includes(to)){console.log(`multi-pos: ${label} already installed`);continue}
    if(!src.includes(from)){console.log(`multi-pos: ${label} anchor unavailable; skipped safely`);continue}
    src=src.replace(from,to);changed=true;console.log(`multi-pos: patched ${label}`);
  }
  if(changed)fs.writeFileSync(path,src);
};

const terminalHelper=`async function requestTerminal(req){
  if(req.user?.tokenType==="STORE_OPERATOR"){
    const rows=await prisma.$queryRaw\`SELECT COALESCE(NULLIF(TRIM(p."terminalPos"),''),'MAIN') AS "terminalPos" FROM "StoreOperatorCredential" c LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=\${req.user.operatorId||req.user.id} AND c."companyId"=\${req.user.companyId} AND c."active"=TRUE LIMIT 1\`;
    return String(rows[0]?.terminalPos||"MAIN").trim().toUpperCase().slice(0,120)||"MAIN";
  }
  return String(req.headers?.["x-mws-terminal-pos"]||"MAIN").trim().toUpperCase().slice(0,120)||"MAIN";
}`;

patch("./routes/cash-control.js",[
  {
    label:"terminal schema and unique open shift",
    from:'  `CREATE UNIQUE INDEX IF NOT EXISTS "CashShiftSession_one_open_per_store_idx" ON "CashShiftSession" ("storeId") WHERE "status"=\'OPEN\'`,',
    to:'  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "terminalPos" TEXT NOT NULL DEFAULT \'MAIN\'`,\n  `DROP INDEX IF EXISTS "CashShiftSession_one_open_per_store_idx"`,\n  `CREATE UNIQUE INDEX IF NOT EXISTS "CashShiftSession_one_open_per_terminal_idx" ON "CashShiftSession" ("storeId","terminalPos") WHERE "status"=\'OPEN\'`,'
  },
  {
    label:"terminal resolver",
    from:'async function ownedStore(storeId,companyId){const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}return store}',
    to:'async function ownedStore(storeId,companyId){const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}return store}\n'+terminalHelper
  },
  {
    label:"terminal-scoped cash overview",
    from:'  assertStoreAccess(req,req.params.storeId);const store=await ownedStore(req.params.storeId,req.user.companyId);\n  const [openRows,recentRows,lastClosedRows]=await Promise.all([\n    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"=\'OPEN\' ORDER BY "openedAt" DESC LIMIT 1`,\n    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} ORDER BY "openedAt" DESC LIMIT 20`,\n    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"=\'CLOSED\' ORDER BY "closedAt" DESC LIMIT 1`\n  ]);',
    to:'  assertStoreAccess(req,req.params.storeId);const store=await ownedStore(req.params.storeId,req.user.companyId),terminalPos=await requestTerminal(req);\n  const [openRows,recentRows,lastClosedRows]=await Promise.all([\n    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"=\'OPEN\' ORDER BY "openedAt" DESC LIMIT 1`,\n    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} ORDER BY "openedAt" DESC LIMIT 20`,\n    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"=\'CLOSED\' ORDER BY "closedAt" DESC LIMIT 1`\n  ]);'
  },
  {
    label:"terminal-scoped shift open",
    from:'  assertStoreAccess(req,req.params.storeId);const store=await ownedStore(req.params.storeId,req.user.companyId),body=openSchema.parse(req.body||{});\n  const existing=await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"=\'OPEN\' LIMIT 1`;if(existing[0])return res.status(409).json({error:"Υπάρχει ήδη ανοιχτή βάρδια για το κατάστημα."});',
    to:'  assertStoreAccess(req,req.params.storeId);const store=await ownedStore(req.params.storeId,req.user.companyId),body=openSchema.parse(req.body||{}),terminalPos=await requestTerminal(req);\n  const existing=await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"=\'OPEN\' LIMIT 1`;if(existing[0])return res.status(409).json({error:`Υπάρχει ήδη ανοιχτή βάρδια στο ${terminalPos}.`});'
  },
  {
    label:"terminal opening continuity",
    from:'  const lastClosedRows=await prisma.$queryRaw`SELECT "nextOpeningTotal" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"=\'CLOSED\' ORDER BY "closedAt" DESC LIMIT 1`;',
    to:'  const lastClosedRows=await prisma.$queryRaw`SELECT "nextOpeningTotal" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"=\'CLOSED\' ORDER BY "closedAt" DESC LIMIT 1`;'
  },
  {
    label:"persist terminal on shift",
    from:'    INSERT INTO "CashShiftSession" ("id","companyId","storeId","shiftLabel","openedBy","openedByName","openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","openingNote")\n    VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${body.shiftLabel},${req.user.id},${actorName},${body.drawer},${body.custody},${body.coins},${body.safe},${operational},${expectedOpening},${openingVariance},${body.note||null}) RETURNING *`;',
    to:'    INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","shiftLabel","openedBy","openedByName","openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","openingNote")\n    VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${terminalPos},${body.shiftLabel},${req.user.id},${actorName},${body.drawer},${body.custody},${body.coins},${body.safe},${operational},${expectedOpening},${openingVariance},${body.note||null}) RETURNING *`;' 
  }
]);

patch("./routes/store-transactions.js",[
  {
    label:"transaction terminal schema",
    from:'  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "closedByName" TEXT`,',
    to:'  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "closedByName" TEXT`,\n  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "terminalPos" TEXT NOT NULL DEFAULT \'MAIN\'`,'
  },
  {
    label:"transaction terminal resolver",
    from:'async function ownedStore(storeId,companyId){\n  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});\n  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}\n  return store;\n}',
    to:'async function ownedStore(storeId,companyId){\n  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});\n  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}\n  return store;\n}\n'+terminalHelper
  },
  {
    label:"transaction overview terminal",
    from:'  const store=await ownedStore(req.params.storeId,req.user.companyId);\n  const openRows=await prisma.$queryRaw`\n    SELECT "id","shiftLabel","openedAt","openedBy","openedByName"\n    FROM "CashShiftSession"\n    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"=\'OPEN\'\n    ORDER BY "openedAt" DESC LIMIT 1\n  `;',
    to:'  const store=await ownedStore(req.params.storeId,req.user.companyId),terminalPos=await requestTerminal(req);\n  const openRows=await prisma.$queryRaw`\n    SELECT "id","shiftLabel","openedAt","openedBy","openedByName","terminalPos"\n    FROM "CashShiftSession"\n    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"=\'OPEN\'\n    ORDER BY "openedAt" DESC LIMIT 1\n  `;'
  },
  {
    label:"transaction write terminal",
    from:'  const actorName=req.user.fullName||"Χρήστης";\n  const paymentKey=isPayment?(body.idempotencyKey||legacyAttachment?.checksum):null;',
    to:'  const actorName=req.user.fullName||"Χρήστης",terminalPos=await requestTerminal(req);\n  const paymentKey=isPayment?(body.idempotencyKey||legacyAttachment?.checksum):null;'
  },
  {
    label:"transaction select open terminal shift",
    from:'      WHERE shift."storeId"=${store.id}\n        AND shift."companyId"=${req.user.companyId}\n        AND shift."status"=\'OPEN\'',
    to:'      WHERE shift."storeId"=${store.id}\n        AND shift."companyId"=${req.user.companyId}\n        AND shift."terminalPos"=${terminalPos}\n        AND shift."status"=\'OPEN\''
  }
]);

patch("./routes/store-pos-pilot-actions.js",[
  {
    label:"pilot terminal resolver and open shift",
    from:'async function openShift(req,storeId){const rows=await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "status"=\'OPEN\' ORDER BY "openedAt" DESC LIMIT 1`;if(!rows[0]){const e=new Error("Δεν υπάρχει ανοιχτή βάρδια. Άνοιξε πρώτα βάρδια.");e.status=409;throw e}return rows[0]}',
    to:terminalHelper+'\nasync function openShift(req,storeId){const terminalPos=await requestTerminal(req),rows=await prisma.$queryRaw`SELECT "id","terminalPos" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${storeId} AND "terminalPos"=${terminalPos} AND "status"=\'OPEN\' ORDER BY "openedAt" DESC LIMIT 1`;if(!rows[0]){const e=new Error(`Δεν υπάρχει ανοιχτή βάρδια στο ${terminalPos}. Άνοιξε πρώτα βάρδια.`);e.status=409;throw e}return rows[0]}'
  }
]);

console.log("Multi-POS shift isolation patch completed.");
