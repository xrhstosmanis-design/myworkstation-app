import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Execute the actual registered route handlers with an isolated database double;
// no server credentials, real messages or production mutations are involved.
function harness(){
  const routes=new Map(),writes=[],events=[],employeeLists=[];
  let task={id:'task',messageId:'message',companyId:'company',storeId:'store',assigneeEmployeeId:null,status:'OPEN'};
  const employees=[{id:'a',storeId:'store',companyId:'company',active:true},{id:'b',storeId:'store',companyId:'company',active:true},{id:'inactive',storeId:'store',companyId:'company',active:false},{id:'other-store',storeId:'other',companyId:'company',active:true},{id:'other-company',storeId:'foreign',companyId:'foreign',active:true}];
  let failAudit=false;
  const db={
    employee:{findMany:async options=>{employeeLists.push(options);return employees.filter(e=>e.storeId===options.where.storeId&&e.active).map(e=>({id:e.id,fullName:e.id}))}},
    store:{findUnique:async({where})=>where.id==='store'?{id:'store',companyId:'company',name:'LAB'}:null},
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.includes('FROM "StoreChatMessage" m'))return [];
      if(sql.includes('FROM "StoreChatSettings"'))return [];
      if(sql.includes('FROM "StoreChatTask"'))return task&&values[0]===task.id&&values[1]===task.companyId&&values[2]===task.storeId?[{...task}]:[];
      if(sql.includes('FROM "Employee"'))return employees.filter(e=>e.id===values[0]&&e.active&&e.storeId===values[1]&&e.companyId===values[2]);
      throw new Error(`Unexpected query ${sql}`);
    },
    $executeRaw:async(strings,...values)=>{
      const sql=strings.join('?');writes.push(sql);
      if(sql.includes('INSERT INTO "WorkforceAuditLog"')){if(failAudit)throw new Error('audit unavailable');events.push({action:values[4],details:JSON.parse(values[6]),actor:values[3]});return 1;}
      if(sql.includes('SET "assigneeEmployeeId"')){task={...task,assigneeEmployeeId:values[0],assignedBy:values[1],assignedAt:values[2]};return 1;}
      if(sql.includes('SET "status"')){task={...task,status:values[0],completedBy:values[1],completedAt:values[2]};return 1;}
      throw new Error(`Unexpected write ${sql}`);
    },
    $transaction:async callback=>{const before=structuredClone(task),beforeEvents=events.length;try{return await callback(db)}catch(error){task=before;events.splice(beforeEvents);throw error}},
  };
  const router={get:(p,...handlers)=>routes.set(`GET ${p}`,handlers.at(-1)),post:()=>{},put:()=>{},patch:(p,...handlers)=>routes.set(`PATCH ${p}`,handlers.at(-1))};
  const source=fs.readFileSync(new URL('../src/routes/store-chat.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function').replace('export default router;','return router;');
  new Function('express','prisma','isPlatformSuperAdmin','crypto',source)({Router:()=>router},db,u=>u?.role==='SUPER_ADMIN',crypto);
  return {events,writes,employeeLists,async messages(user){const res={statusCode:200,status(c){this.statusCode=c;return this},setHeader(){},json(data){this.body=data;return this}};let error;await routes.get("GET /stores/:storeId/messages")({params:{storeId:"store"},query:{},user},res,e=>{error=e});return {...res,error}},get task(){return task},failAudit:()=>{failAudit=true},async patch(body,user={id:'owner',role:'OWNER',companyId:'company'},taskId='task'){
    const req={params:{storeId:'store',taskId},body,user};const res={statusCode:200,status(code){this.statusCode=code;return this},json(data){this.body=data;return this}};let error;
    await routes.get('PATCH /stores/:storeId/tasks/:taskId')(req,res,e=>{error=e});return {...res,error};
  }};
}

test('owner assigns, reassigns and unassigns once each with actor and prior assignee audit',async()=>{
  const h=harness();assert.equal((await h.patch({assigneeEmployeeId:'a'})).statusCode,200);assert.equal(h.task.assigneeEmployeeId,'a');assert.equal(h.task.assignedBy,'owner');assert.ok(h.task.assignedAt instanceof Date);
  assert.equal((await h.patch({assigneeEmployeeId:'a'})).body.changed,false);assert.equal(h.events.length,1);
  await h.patch({assigneeEmployeeId:'b'});assert.equal(h.events[1].details.previousAssigneeEmployeeId,'a');assert.equal(h.task.assigneeEmployeeId,'b');
  await h.patch({assigneeEmployeeId:null});assert.equal(h.task.assigneeEmployeeId,null);assert.equal(h.events.at(-1).action,'STORE_CHAT_TASK_UNASSIGNED');assert.equal(h.events.length,3);assert.equal(h.task.status,'OPEN');
});
test('platform Super Admin assignment uses scoped selected store',async()=>{const h=harness();assert.equal((await h.patch({assigneeEmployeeId:'a'},{id:'sa',role:'SUPER_ADMIN'})).statusCode,200);assert.equal(h.task.assignedBy,'sa')});
test('operator and ordinary employee cannot assign or unassign',async()=>{for(const user of [{id:'op',role:'OWNER',tokenType:'STORE_OPERATOR',storeId:'store',companyId:'company'},{id:'employee',role:'EMPLOYEE',companyId:'company'}]){const h=harness();for(const id of ['a',null])assert.equal((await h.patch({assigneeEmployeeId:id},user)).statusCode,403);assert.equal(h.writes.length,0)}});
test('foreign company/operator store and nonexistent task cannot be mutated',async()=>{const h=harness();assert.equal((await h.patch({assigneeEmployeeId:'a'},{id:'owner',role:'OWNER',companyId:'foreign'})).statusCode,404);assert.equal((await h.patch({assigneeEmployeeId:'a'},{id:'op',role:'OWNER',tokenType:'STORE_OPERATOR',companyId:'company',storeId:'other'})).statusCode,404);assert.equal((await h.patch({assigneeEmployeeId:'a'},undefined,'missing')).statusCode,404);assert.equal(h.writes.length,0)});
test('inactive, other store/company and nonexistent employees are rejected without writes',async()=>{for(const id of ['inactive','other-store','other-company','missing']){const h=harness();assert.equal((await h.patch({assigneeEmployeeId:id})).statusCode,400);assert.equal(h.writes.length,0);assert.equal(h.task.assigneeEmployeeId,null)}});
test('malformed or mixed assignment/completion fails before changing any state',async()=>{for(const body of [{assigneeEmployeeId:''},{assigneeEmployeeId:' '},{assigneeEmployeeId:12},{assigneeEmployeeId:{}},{assigneeEmployeeId:'a'.repeat(201)},{assigneeEmployeeId:'a',completed:true}]){const h=harness();assert.equal((await h.patch(body)).statusCode,400);assert.equal(h.writes.length,0)}});
test('legacy complete and reopen preserve assignment and linked message',async()=>{const h=harness();await h.patch({assigneeEmployeeId:'a'});await h.patch({completed:true});assert.equal(h.task.status,'COMPLETED');assert.equal(h.task.assigneeEmployeeId,'a');await h.patch({completed:false});assert.equal(h.task.status,'OPEN');assert.equal(h.task.completedBy,null);assert.equal(h.task.completedAt,null);assert.equal(h.task.assigneeEmployeeId,'a');assert.equal(h.task.messageId,'message')});
test('assignment rolls back when its audit fails',async()=>{const h=harness();h.failAudit();assert.match((await h.patch({assigneeEmployeeId:'a'})).error.message,/audit unavailable/);assert.equal(h.task.assigneeEmployeeId,null);assert.equal(h.events.length,0)});

test('eligible employee list exposes only ids/names to managers, never to operators',async()=>{const h=harness();const owner=await h.messages({id:'owner',role:'OWNER',companyId:'company'});assert.equal(owner.error,undefined);assert.deepEqual(owner.body.assignees,[{id:'a',fullName:'a'},{id:'b',fullName:'b'}]);assert.deepEqual(h.employeeLists[0].select,{id:true,fullName:true});assert.deepEqual(h.employeeLists[0].where,{storeId:'store',active:true});const operator=await h.messages({id:'op',role:'OWNER',tokenType:'STORE_OPERATOR',storeId:'store',companyId:'company'});assert.deepEqual(operator.body.assignees,[]);assert.equal(h.employeeLists.length,1);assert.equal(operator.body.permissions.canManageTask,false)});
