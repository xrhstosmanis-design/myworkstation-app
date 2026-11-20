import test from 'node:test';
import assert from 'node:assert/strict';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native cash audit table availability uses nullable text equivalent to PostgreSQL IS NOT NULL without schema changes',{skip:!isolated()&&!process.env.CI},async()=>{
 assert.ok(isolated(),'Native cash regclass probe requires an isolated test PostgreSQL URL in CI');
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{const rows=await db.$queryRaw`SELECT to_regclass('"StoreOperatorAudit"')::text AS "operator",to_regclass('"StoreOperatorAudit"') IS NOT NULL AS "operatorExists",to_regclass('"PosSaleActionAudit"')::text AS "actions",to_regclass('"PosSaleActionAudit"') IS NOT NULL AS "actionsExist",to_regclass('"PosSaleSafetyAudit"')::text AS "safety",to_regclass('"PosSaleSafetyAudit"') IS NOT NULL AS "safetyExists",to_regclass('pg_catalog.pg_class')::text AS "present",to_regclass('pg_catalog.no5_cash_missing_regclass_probe')::text AS "missing",to_regclass('pg_catalog.no5_cash_missing_regclass_probe') IS NOT NULL AS "missingExists"`;
 assert.equal(rows.length,1);const r=rows[0];for(const[value,exists]of [['operator','operatorExists'],['actions','actionsExist'],['safety','safetyExists']]){assert.ok(r[value]===null||typeof r[value]==='string');assert.equal(r[exists],r[value]!==null)}assert.equal(typeof r.present,'string');assert.equal(r.missing,null);assert.equal(r.missingExists,false);
 }finally{await db.$disconnect()}
});
