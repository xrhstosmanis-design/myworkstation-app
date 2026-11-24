import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {staffAccountStatusCapability as capability,staffAccountStatusTarget,staffCompanyRequestCapability,changeStaffCompanyCapability} from '../../shared/backoffice-staff-company.mjs';

test('staff status is an exact company-only action with its own grant',()=>{
  const path='/api/backoffice-staff/company/staff-account-status/target';
  assert.equal(staffCompanyRequestCapability('PATCH',path),capability);
  assert.equal(staffCompanyRequestCapability('GET',path),null);
  for(const invalid of [path+'/',path+'/pin',path+'?storeId=s',path+'%2Fother']){
    assert.equal(staffCompanyRequestCapability('PATCH',invalid),null);
  }
  assert.deepEqual(changeStaffCompanyCapability([],capability,true),[capability,'staff-policy.read']);
});

test('staff status writer changes only another company employee account and revokes sessions once',async()=>{
  const source=(await readFile(new URL('../src/services/backoffice-staff-account-status.js',import.meta.url),'utf8'))
    .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const user={id:'actor',staffAccess:true,companyId:'company'},grant={companyId:'company',capability,revision:4};
  const path='/api/backoffice-staff/company/staff-account-status/target';
  const request=extra=>({user,staffCompanyGrant:grant,method:'PATCH',originalUrl:path,
    get:key=>key==='x-backoffice-company-id'?'company':undefined,body:{active:false,expectedRevision:3},...extra});
  let target={active:true,revision:3},liveRevision=4;
  const audit=[],revoked=[];
  const staffError=(status=403,code)=>Object.assign(new Error(code),{status,code});
  const save=new Function('z','randomUUID','capability','staffAccountStatusTarget','staffError','requireStaffCompanyGrant','revokeStaffSessions',
    source+'\nreturn saveStaffAccountStatus;')(
    z,randomUUID,capability,staffAccountStatusTarget,staffError,async()=>({...grant,revision:liveRevision}),async(_tx,id)=>revoked.push(id)
  );
  const db={$transaction:fn=>fn(db),async $queryRaw(parts,...args){
    assert.deepEqual(args,['company','target']);
    assert.match(parts.join('?'),/u\."role"::text='EMPLOYEE'/);
    return target?[target]:[];
  },async $executeRaw(parts,...args){
    const sql=parts.join('?');
    if(sql.includes('pg_advisory_xact_lock'))return;
    if(sql.includes('UPDATE "BackofficeStaffAccount"')){
      assert.deepEqual(args,[false,'company','target']);
      assert.doesNotMatch(sql,/companyCapabilities|pinHash|password|BackofficeStaffGrant/);
      target={...target,active:false,revision:target.revision+1};
      return;
    }
    assert.match(sql,/INSERT INTO "BackofficeStaffAudit"/);
    audit.push(args.slice(1));
  }};
  await assert.rejects(save(db,request({originalUrl:path.replace(/target$/,'actor')})),{status:403});
  await assert.rejects(save(db,request({body:{active:false,expectedRevision:3,pin:'1234'}})),{status:400});
  liveRevision++;
  await assert.rejects(save(db,request()),{status:403});
  liveRevision--;
  const initial=target;target=null;
  await assert.rejects(save(db,request()),{status:404});target=initial;
  assert.deepEqual(await save(db,request()),{ok:true,companyId:'company',id:'target',active:false,revision:4});
  await assert.rejects(save(db,request()),{status:409});
  assert.deepEqual(revoked,['target']);
  assert.deepEqual(audit,[['company','actor','target','ACCOUNT_DEACTIVATED',JSON.stringify({before:true,after:false,previousRevision:3})]]);
});
