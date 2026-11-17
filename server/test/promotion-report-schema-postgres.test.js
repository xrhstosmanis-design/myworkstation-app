import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {automaticReportDispatchDDL} from '../src/services/automatic-report-dispatch-schema.js';

const isolated=()=>{
  try{
    const url=new URL(process.env.DATABASE_URL);
    return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname);
  }catch{return false}
};

test('promotion migration preserves cash and supplier policy bounds and can be applied twice',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const schema='promotion_schema_'+randomUUID().replaceAll('-','');
  const admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const ddl of automaticReportDispatchDDL)await db.$executeRawUnsafe(ddl);
    const supplier=await readFile(new URL('../scripts/sql/automatic-report-supplier-comparison.sql',import.meta.url),'utf8');
    const promotion=await readFile(new URL('../scripts/sql/automatic-report-promotion-result.sql',import.meta.url),'utf8');
    // Each reviewed script runs in its own transaction on one connection.
    for(const sql of [supplier,promotion,promotion]){
      const statements=sql.split(';').map(part=>part.trim()).filter(Boolean);
      assert.equal(statements.shift(),'BEGIN');
      assert.equal(statements.pop(),'COMMIT');
      await db.$transaction(async tx=>{
        for(const statement of statements)await tx.$executeRawUnsafe(statement);
      });
    }
    for(const [type,frequencies] of [['CASH',['DAILY','MONTHLY']],['SUPPLIER_COMPARISON',['MONTHLY']],['PROMOTION_RESULT',['EVENT']]]){
      await db.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy"
        ("companyId","storeId","reportType","allowedFrequencies","lifecycleGeneration","updatedBy","updatedAt")
        VALUES ('c','s',${type},${frequencies}::text[],0,'u',NOW())`;
    }
    for(const [type,frequencies] of [['CASH',['EVENT']],['SUPPLIER_COMPARISON',['EVENT']],['PROMOTION_RESULT',['MONTHLY']],['PROMOTION_RESULT',['EVENT','EVENT']]]){
      await assert.rejects(db.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy"
        ("companyId","storeId","reportType","allowedFrequencies","lifecycleGeneration","updatedBy","updatedAt")
        VALUES ('c','invalid',${type},${frequencies}::text[],0,'u',NOW())`,error=>error.meta?.code==='23514');
    }
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "AutomaticReportDispatchPolicy"`)[0].n,3);
  }finally{
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
