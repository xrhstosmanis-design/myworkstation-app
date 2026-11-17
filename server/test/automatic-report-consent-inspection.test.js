import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAutomaticReportConsentInspection} from '../src/services/automatic-report-consent-inspection.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';

const definition=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/automatic-report-consent-extension.proposed.json',import.meta.url),'utf8'));
const name='AutomaticReportSupplierComparisonConsent';
function fixture(overrides={}){
  const manifest=reviewedFreshStoreManifest();
  const relation={name,kind:'r',owner_valid:true,partition:false,rls:false,forced:false,inherited:false,rewritten:false};
  const columns=manifest.knownColumns.AutomaticReportRecipientConsent.map(([field,type,notNull])=>({table:name,name:field,type,notNull,identity:'',generated:'',default_expression:definition.defaults[field]??null}));
  const keys=[
    {table:name,kind:'p',validated:true,deferrable:false,columns:['companyId','storeId','recipientId']},
    {table:name,kind:'f',validated:true,deferrable:false,update_action:'a',delete_action:'a',match_type:'s',parent:'AutomaticReportRecipient',parentSchema:'fixture',columns:['companyId','storeId','recipientId'],parentColumns:['companyId','storeId','recipientId']}
  ];
  const tx={$queryRawUnsafe:async sql=>{
    if(sql.includes('FROM pg_attribute'))return overrides.columns??columns;
    if(sql.includes('FROM pg_trigger'))return overrides.triggers??[];
    if(sql.includes("k.contype='c'"))return overrides.checks??definition.checks[name][0].map(value=>({table:name,validated:true,deferrable:false,definition:value}));
    if(sql.includes('FROM pg_index'))return overrides.indexes??[{table:name,primary:true,unique:true,valid:true,ready:true,immediate:true,predicate:null,expression:null,columns:['companyId','storeId','recipientId']}];
    if(sql.includes('FROM pg_constraint'))return overrides.keys??keys;
    if(sql.includes('FROM pg_class'))return overrides.relations??[relation];
    return [{name:'Store',kind:'r'},{name,kind:'r'},{name:'UnreviewedTable',kind:'r'},
      {table:name,name:'storeId'},{child:name,parent:'AutomaticReportRecipient'},{name,applicationData:true}];
  }};
  return {tx,manifest,keys,columns,relation};
}

test('source inspection hides only separately validated consent metadata and preserves unknown relations',async()=>{
  const {tx,manifest}=fixture();
  const prepared=await prepareAutomaticReportConsentInspection(tx,'fixture',manifest,{extensions:[name]});
  assert.deepEqual(await prepared.tx.$queryRawUnsafe('SELECT lifecycle catalogue'),[
    {name:'Store',kind:'r'},{name:'UnreviewedTable',kind:'r'},{name,applicationData:true}
  ]);
  assert.equal(prepared.evidence.relations[0].name,name);
});

test('unknown, altered or already guarded additions cannot enter source profile inspection',async()=>{
  for(const options of [{extensions:['Unknown']},{extensions:[name,name]}]){
    await assert.rejects(prepareAutomaticReportConsentInspection({},'fixture',reviewedFreshStoreManifest(),options),/requires review/);
  }
  for(const overrides of [
    {relations:[]},
    {columns:[]},
    {triggers:[{table:name,name:'unreviewed_trigger'}]},
    {keys:[]},
    {keys:fixture().keys.map(key=>key.kind==='f'?{...key,delete_action:'c'}:key)},
    {keys:[{table:'AnotherTable',kind:'f',parent:name}]}
  ]){
    const {tx,manifest}=fixture(overrides);
    await assert.rejects(prepareAutomaticReportConsentInspection(tx,'fixture',manifest,{extensions:[name]}),/requires review/);
  }
});

test('unexpected defaults, CHECK definitions, indexes or relation owner refuse additive inspection',async()=>{
 const original=fixture();
 const changedColumns=original.columns.map(column=>({...column,default_expression:column.name==='revision'?'malicious_default()':column.default_expression}));
 const variants=[{columns:changedColumns},{checks:[]},{checks:[{table:name,validated:true,deferrable:false,definition:'CHECK (true)'}]},{indexes:[]},{indexes:[{table:name,primary:true,unique:true,valid:true,ready:true,immediate:true,predicate:null,expression:null,columns:['companyId','storeId','recipientId']},{table:name,primary:false}]},{relations:[{...original.relation,owner_valid:false}]}];
 for(const overrides of variants){const {tx,manifest}=fixture(overrides);await assert.rejects(prepareAutomaticReportConsentInspection(tx,'fixture',manifest,{extensions:[name]}),/requires review/);}
});

test('optional local PostgreSQL catalogue sanity accepts canonical consents and refuses drift',async context=>{
 let PGlite;
 try{({PGlite}=await import('@electric-sql/pglite'));}
 catch(error){
  if(error.code!=='ERR_MODULE_NOT_FOUND'||!error.message.includes("Cannot find package '@electric-sql/pglite'"))throw error;
  context.skip('Optional local @electric-sql/pglite is unavailable. Native PostgreSQL installation tests run separately.');
  return;
 }
 const {automaticReportDispatchDDL}=await import('../src/services/automatic-report-dispatch-schema.js');
 const pg=new PGlite();
 try{
  await pg.exec('CREATE TABLE "Store" ("id" TEXT PRIMARY KEY)');
  for(const ddl of automaticReportDispatchDDL)await pg.exec(ddl);
  for(const file of ['automatic-report-supplier-comparison.sql','automatic-report-promotion-result.sql','automatic-report-inventory-result.sql'])await pg.exec(readFileSync(new URL('../scripts/sql/'+file,import.meta.url),'utf8'));
  const tx={$queryRawUnsafe:async(sql,...values)=>(await pg.query(sql,values)).rows};
  const extensions=[name,'AutomaticReportEventConsent'],manifest=reviewedFreshStoreManifest();
  const accepted=await prepareAutomaticReportConsentInspection(tx,'public',manifest,{extensions});
  assert.equal(accepted.evidence.indexes.length,2);
  for(const [change,restore] of [
   ['ALTER TABLE "AutomaticReportEventConsent" ALTER COLUMN "revision" SET DEFAULT 2','ALTER TABLE "AutomaticReportEventConsent" ALTER COLUMN "revision" SET DEFAULT 1'],
   ['ALTER TABLE "AutomaticReportEventConsent" ADD CONSTRAINT unexpected CHECK (true)','ALTER TABLE "AutomaticReportEventConsent" DROP CONSTRAINT unexpected'],
   ['CREATE INDEX unexpected_consent_idx ON "AutomaticReportEventConsent" ("recipientId")','DROP INDEX unexpected_consent_idx']
  ]){
   await pg.exec(change);
   await assert.rejects(prepareAutomaticReportConsentInspection(tx,'public',manifest,{extensions}),/requires review/);
   await pg.exec(restore);
  }
  await prepareAutomaticReportConsentInspection(tx,'public',manifest,{extensions});
 }finally{await pg.close();}
});
