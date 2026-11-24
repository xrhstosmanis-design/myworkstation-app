import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {staffDisplayNameCapability as capability,staffDisplayNameTarget,staffCompanyRequestCapability,changeStaffCompanyCapability} from '../../shared/backoffice-staff-company.mjs';

const path='/api/backoffice-staff/company/staff-display-names/target';
const grant={companyId:'company',capability,revision:6};
const user={id:'actor',companyId:'company',staffAccess:true};
const req=(props={})=>({
  user,method:'PATCH',originalUrl:path,body:{fullName:'New name',expectedFullName:'Original name'},staffCompanyGrant:grant,
  query:{},get:key=>key==='x-backoffice-company-id'?'company':undefined,...props
});
test('display-name action has an exact company route and a separate owner grant',()=>{
  assert.equal(staffCompanyRequestCapability('PATCH',path),capability);
  for(const invalid of [path+'/',path+'/pin',path+'?companyId=other',path.replace('/target','/target%2Fsibling')]){
    assert.equal(staffCompanyRequestCapability('PATCH',invalid),null);
  }
  assert.equal(staffCompanyRequestCapability('POST',path),null);
  assert.deepEqual(changeStaffCompanyCapability([],capability,true),[capability,'staff-policy.read']);
  assert.deepEqual(changeStaffCompanyCapability([capability,'staff-policy.read'],'staff-policy.read',false),[]);
});

test('display-name writer rejects self, scope, stale and extra fields, then changes one User and audits once',async()=>{
  const source=(await readFile(new URL('../src/services/backoffice-staff-display-name.js',import.meta.url),'utf8'))
    .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const staffError=(status=403,code)=>Object.assign(new Error(code),{status,code});
  const checks=[];
  let liveRevision=6;
  const requireStaffCompanyGrant=async(_tx,actor,cap)=>{
    assert.deepEqual(actor,user);assert.equal(cap,capability);checks.push('verified');
    return {...grant,revision:liveRevision};
  };
  const save=new Function('z','randomUUID','capability','staffDisplayNameTarget','staffError','requireStaffCompanyGrant',
    source+'\nreturn saveStaffDisplayName;')(z,randomUUID,capability,staffDisplayNameTarget,staffError,requireStaffCompanyGrant);
  let fullName='Original name',targetPresent=true;
  const db={$transaction:fn=>fn(db),async $executeRaw(parts,...args){
    const sql=parts.join('?');
    if(sql.includes('pg_advisory_xact_lock')){checks.push('locked');return}
    if(sql.includes('UPDATE "User"')){
      assert.deepEqual(args,['New name','target','company']);
      assert(!/password|pin|session|capabilit|active/i.test(sql));
      fullName=args[0];checks.push('updated');return 1;
    }
    assert.match(sql,/INSERT INTO "BackofficeStaffAudit"/);
    assert.deepEqual(args.slice(1,4),['company','actor','target']);
    assert.deepEqual(JSON.parse(args[4]),{before:'Original name',after:'New name'});
    checks.push('audited');return 1;
  },async $queryRaw(parts,...args){
    assert.deepEqual(args,['company','target']);assert.match(parts.join('?'),/JOIN "User".*AND u."companyId"=a."companyId"/s);
    return targetPresent?[{fullName}]:[];
  }};
  await assert.rejects(save(db,req({originalUrl:path.replace(/target$/,'actor')})),{status:403});
  await assert.rejects(save(db,req({query:{scope:'foreign'}})),{status:403});
  await assert.rejects(save(db,req({body:{...req().body,pin:'1234'}})),{status:400});
  assert.deepEqual(checks,[]);
  liveRevision=7;
  await assert.rejects(save(db,req()),{status:403});
  liveRevision=6;targetPresent=false;
  await assert.rejects(save(db,req()),{status:404});
  targetPresent=true;
  await assert.rejects(save(db,req({body:{...req().body,expectedFullName:'Outdated name'}})),{status:409});
  const result=await save(db,req());
  assert.deepEqual(result,{ok:true,companyId:'company',id:'target',fullName:'New name'});
  assert.deepEqual(await save(db,req()),result);
  assert.equal(checks.filter(x=>x==='updated').length,1);
  assert.equal(checks.filter(x=>x==='audited').length,1);
});
