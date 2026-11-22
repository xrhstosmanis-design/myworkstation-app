import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

const read = name => readFileSync(new URL('../src/routes/'+name, import.meta.url),'utf8');
const source = read('platform-workforce-v2-attendance.js');
const [handlerSource] = source.match(/router\.post\("\/clock",async[\s\S]+?(?=\nconst approvalBody)/);

test('manual attendance gets an explicit store grant and needs attendance read',()=>{
  const base = '/api/platform/store-modules/companies/company/stores/store/workforce-v2/attendance';
  assert.equal(staffRequestCapability('POST',base+'/clock'),'attendance.clock');
  assert.equal(staffRequestCapability('GET',base+'/clock'),null);
  assert.equal(staffRequestCapability('POST',base+'/clock/elsewhere'),null);
  assert.equal(validStaffCapabilities(['attendance.clock']),false);
  assert.equal(validStaffCapabilities(['attendance.read','attendance.clock']),true);
});

test('clock handler checks live grant and locks employee before scope and session lookup',async()=>{
  let handler;
  const events=[];
  let allowed=true, employeeExists=true;
  let session=null;
  const tx={
    $queryRaw:async(sql,...values)=>{
      if(sql.join('').includes('FROM "WorkforceEmployee"')){
        assert.deepEqual(values,['employee','company']);events.push('employee-lock');
        return [{id:'employee'}];
      }
      assert.match(sql.join(''),/FROM "WorkforceAttendanceSession"[\s\S]*FOR UPDATE/);
      assert.deepEqual(values,['company','store','employee']);events.push('session-lock');
      return session?.status==='OPEN'?[session]:[];
    },
    workforceEmployee:{findFirst:async({where})=>{
      assert.equal(where.companyId,'company');assert.equal(where.OR[0].baseStoreId,'store');
      assert.equal(where.OR[1].storeAccess.some.storeId,'store');assert.equal(where.active,true);
      events.push('employee-scope');return employeeExists?{id:'employee',fullName:'Employee'}:null;
    }},
    workforceTimeClockEntry:{create:async({data})=>{
      assert.equal(data.createdByUserId,'delegate');events.push('clock-write');return {id:'entry'};
    }},
    workforceScheduleAssignment:{findUnique:async()=>null},
    workforceAttendanceSession:{
      create:async({data})=>session={...data,id:'session'},
      update:async({where,data})=>session={...session,...data,id:where.id}
    }
  };
  let tail=Promise.resolve();
  const prisma={$transaction:operation=>{
    const run=tail.then(()=>operation(tx));
    tail=run.catch(()=>{});
    return run;
  }};
  new Function('router','prisma','contextFor','clockBody','requireStaffGrant','isApprovalUser','loadEmployee','publishedAssignment','iso','issueSummary','audit',handlerSource)(
    {post(_path,fn){handler=fn}},prisma,async()=>({company:{id:'company'},store:{id:'store'}}),
    {parse:body=>body},async(db,user,store,right)=>{
      assert.equal(db,tx);assert.equal(user.id,'delegate');assert.equal(store,'store');assert.equal(right,'attendance.clock');
      events.push('grant');if(!allowed)throw Object.assign(Error('revoked'),{status:403});
    },()=>false,async()=>null,async(db)=>{assert.equal(db,tx);return null},()=> '2026-11-22',
    ()=>({issues:[]}),async(_tx,_req,data)=>{assert.equal(data.reason,'Correct clock');events.push('audit')}
  );
  const call=async(eventType,expectedSessionId)=>{
    let result;
    await handler({user:{id:'delegate',staffAccess:true},body:{
      employeeId:'employee',eventType,expectedSessionId,reason:'Correct clock'
    }},{status:status=>({json:body=>{result={status,body}}})},error=>{
      if(!error.status)throw error;
      result={status:error.status};
    });
    return result;
  };
  const [first,repeat]=await Promise.all([call('IN'),call('IN')]);
  assert.deepEqual(first,{status:201,body:{item:{id:'session',companyId:'company',storeId:'store',status:'OPEN'}}});
  assert.equal(repeat.status,409);
  assert.deepEqual(events.slice(0,6),['grant','employee-lock','employee-scope','session-lock','clock-write','audit']);
  assert.equal((await call('OUT','wrong-session')).status,409);
  allowed=false;
  assert.equal((await call('OUT','session')).status,403);
  allowed=true;
  employeeExists=false;
  assert.equal((await call('OUT','session')).status,404);
  employeeExists=true;
  assert.equal((await call('OUT','session')).status,201);
  assert.equal((await call('OUT','session')).status,409);
  assert.equal(events.filter(event=>event==='clock-write').length,2);
});

test('POS and manual writers take the same employee and open-session locks before writing',()=>{
  const pos=read('cash-control.js').split('async function syncOperatorWorkforceAttendance')[1].split('router.use')[0];
  for (const writer of [handlerSource,pos]) {
    const employeeLock=writer.indexOf('FROM "WorkforceEmployee"');
    const sessionLock=writer.indexOf('FROM "WorkforceAttendanceSession"');
    const entry=writer.indexOf('workforceTimeClockEntry.create');
    assert.ok(employeeLock>=0&&employeeLock<sessionLock&&sessionLock<entry);
    assert.equal(writer.slice(employeeLock,entry).match(/FOR UPDATE/g)?.length,2);
  }
});
