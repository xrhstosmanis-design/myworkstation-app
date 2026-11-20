import assert from "node:assert/strict";
import test from "node:test";
import {mountChatGroups} from "../src/chat-groups.mjs";

const store = {id:"store",companyId:"company"};
const owner = {id:"owner",role:"OWNER",fullName:"Owner"};
const member = {id:"operator-one",role:"STAFF",fullName:"Staff"};
const outsider = {id:"other-operator",role:"STAFF"};
const requestId = "ea8e17d9-2d65-4ee9-bf4c-726fbe387874";

function fixture() {
  const handlers = new Map();
  const groups = new Map();
  const messages = new Map();
  let active = true;
  const lookup = (companyId, storeId, groupId, userId) => {
    const group = groups.get(groupId);
    if (group?.companyId === companyId && group?.storeId === storeId && group.members.has(userId)) return group;
  };
  const db = {
    store:{findFirst: async ({where}) => {
      assert.equal(where.active, true);
      assert.equal(where.company.active, true);
      return active ? {id:where.id} : null;
    }},
    async $transaction(action) { return action(this); },
    async $executeRaw(parts, ...args) {
      const sql = parts.join("?");
      if (sql.includes('INSERT INTO "StoreChatGroup"')) {
        const [id, companyId, storeId, name] = args;
        groups.set(id,{id,companyId,storeId,name,members:new Set()});
        return 1;
      }
      if (sql.includes('INSERT INTO "StoreChatGroupMember"')) {
        const [groupId, userIds] = args;
        for (const userId of userIds) groups.get(groupId).members.add(userId);
        return userIds.length;
      }
      if (sql.includes('DELETE FROM "StoreChatGroupMember"')) {
        const [userId,groupId,companyId,storeId] = args;
        return lookup(companyId,storeId,groupId,userId)?.members.delete(userId) ? 1 : 0;
      }
      assert.match(sql, /JOIN "StoreChatGroupMember"/);
      const [id, senderId, senderName, body, companyId, storeId, groupId, userId] = args;
      if (!lookup(companyId,storeId,groupId,userId) || messages.has(id)) return 0;
      messages.set(id,{messageId:id,groupId,senderId,senderName,body});
      return 1;
    },
    async $queryRaw(parts, ...args) {
      const sql = parts.join("?");
      if (sql.includes('FROM "StoreOperatorCredential"')) {
        assert.match(sql, /c\."companyId"=\? AND c\."storeId"=\?/);
        assert.deepEqual(args,[store.companyId,store.id]);
        return [{id:member.id,name:member.fullName}];
      }
      assert.match(sql, /g\."companyId"=\? AND g\."storeId"=\?/);
      if (sql.includes('LEFT JOIN LATERAL')) {
        const [companyId,storeId,groupId,userId] = args;
        if (!lookup(companyId,storeId,groupId,userId)) return [];
        const rows = [...messages.values()].filter(message => message.groupId === groupId);
        return rows.length ? rows : [{id:groupId,messageId:null}];
      }
      if (sql.includes('message."body"')) {
        const [companyId,storeId,groupId,id,senderId,userId] = args;
        const message = messages.get(id);
        return lookup(companyId,storeId,groupId,userId) && message?.groupId === groupId &&
          message?.senderId === senderId ? [{body:message.body}] : [];
      }
      const [companyId,storeId,userId] = args;
      return [...groups.values()].filter(group => lookup(companyId,storeId,group.id,userId))
        .map(({id,name}) => ({id,name}));
    },
  };
  const base = "/stores/:storeId/groups";
  mountChatGroups({
    get:(path, handler) => handlers.set(`GET ${path}`,handler),
    post:(path, handler) => handlers.set(`POST ${path}`,handler),
  },{
    db, selectStore:async (req) => req.store, checkModule:async (req,res) => {
      if (req.allowed) return true;
      res.status(403).json({message:"Module denied"});
      return false;
    },
    canManage:user => user.role === "OWNER",
    canModerate:user => ["OWNER","SUPER_ADMIN"].includes(user.role),
    auditModeration:async () => {},
  });
  return {
    deactivate:() => { active = false; },
    size:() => messages.size,
    async request(method,{user=owner,selected=store,groupId,body,allowed=true,action="messages"}={}) {
      const res = {code:200,status(code){this.code=code;return this;},
        setHeader(name,value){this[name]=value;},json(data){this.data=data;}};
      const path = groupId ? `${base}/:groupId/${action}` : base;
      await handlers.get(`${method} ${path}`)({store:selected,allowed,user,body,params:{groupId}},
        res,error => { res.status(error.status).json({message:error.message}); });
      return res;
    },
  };
}

test("staff groups scope creation, history and retry to selected-store members", async () => {
  const h = fixture();
  const input = {name:"Πρωινή βάρδια",memberIds:[member.id,member.id]};
  assert.equal((await h.request("POST",{user:member,body:input})).code,403);
  assert.equal((await h.request("POST",{body:{...input,memberIds:[outsider.id]}})).code,400);
  const created = await h.request("POST",{body:input});
  assert.equal(created.code,201);
  const {id:groupId} = created.data;
  const list = await h.request("GET",{user:member});
  assert.deepEqual(list.data,{groups:[created.data],members:[],mayCreate:false});
  assert.equal(list["Cache-Control"],"no-store, private");
  assert.deepEqual((await h.request("GET",{user:member,groupId})).data,{messages:[]});
  const body = {body:"Μήνυμα ομάδας",requestId};
  assert.equal((await h.request("POST",{user:outsider,groupId,body})).code,404);
  assert.equal((await h.request("GET",{user:outsider,groupId})).code,404);
  assert.equal((await h.request("GET",{user:member,groupId,selected:{...store,id:"other-store"}})).code,404);
  assert.equal((await h.request("GET",{user:member,groupId,allowed:false})).code,403);
  assert.equal((await h.request("POST",{user:member,groupId,body})).code,201);
  assert.equal((await h.request("POST",{user:member,groupId,body})).code,200);
  assert.equal((await h.request("POST",{user:member,groupId,body:{...body,body:"Άλλο μήνυμα"}})).code,409);
  assert.equal(h.size(),1);
  const {messages} = (await h.request("GET",{groupId})).data;
  assert.equal(messages[0].body,body.body);
  assert.equal(messages[0].ownMessage,false);
  h.deactivate();
  assert.equal((await h.request("GET",{user:member,groupId})).code,404);
});

test("web Chat opens only its selected staff group and sends in that group", async () => {
  const {mount} = await import("./helpers/store-chat-mount.mjs");
  const group = {id:"fixture-group",name:"Πρωινή βάρδια"};
  const base = "/api/store-chat/stores/store/groups";
  const messageRoute = `${base}/${group.id}/messages`;
  const h = await mount(async (path, options) => {
    if (path === base) return {groups:[group],mayCreate:false,members:[]};
    if (path === messageRoute) {
      if (options.method === "POST") return {id:"sent"};
      return {messages:[{id:"private-row",senderName:"Staff",body:"Ιδιωτικό μήνυμα ομάδας"}]};
    }
    return {store,rows:[],settings:{},permissions:{},interactionsAvailable:true};
  });
  const click = label => h.act(async () => {
    const target = [...document.querySelectorAll("button")].find(button =>
      button.textContent.trim() === label || button.getAttribute("aria-label") === label);
    assert.ok(target);
    target.click();
  });
  try {
    await h.render(store.id);
    await click("Περισσότερα εργαλεία συνομιλίας");
    await click("Ομάδες προσωπικού");
    await h.flush();
    const dialog = document.querySelector('[aria-label="Ομάδες προσωπικού"]');
    assert.ok(dialog);
    assert.doesNotMatch(dialog.textContent,/Νέα ομάδα/);
    await h.act(async () => {
      const select = dialog.querySelector("select");
      select.value = group.id;
      select.dispatchEvent(new h.dom.window.Event("change",{bubbles:true}));
    });
    await h.flush();
    assert.match(dialog.textContent,/Ιδιωτικό μήνυμα ομάδας/);
    assert.doesNotMatch(document.querySelector(".store-chat-messages").textContent,/Ιδιωτικό μήνυμα ομάδας/);
    await h.act(async () => {
      const textarea = dialog.querySelector("textarea");
      Object.getOwnPropertyDescriptor(h.dom.window.HTMLTextAreaElement.prototype,"value")
        .set.call(textarea,"Απάντηση ομάδας");
      textarea.dispatchEvent(new h.dom.window.Event("input",{bubbles:true}));
    });
    await click("Αποστολή");
    await h.flush();
    const post = h.calls.find(call => call.method === "POST");
    assert.equal(post.path,messageRoute);
    assert.equal(post.body.body,"Απάντηση ομάδας");
    assert.match(post.body.requestId,/^[a-f0-9-]{36}$/);
    await click("Κλείσιμο");
    assert.equal(document.querySelector('[aria-label="Ομάδες προσωπικού"]'),null);
  } finally {
    await h.close();
  }
});

test("owner and Super Admin can remove members only in the selected store", async () => {
  const h = fixture();
  const input = {name:"Βάρδια",memberIds:[member.id]};
  const {data:{id:groupId}} = await h.request("POST",{body:input});
  const remove = {groupId,action:"remove-member",body:{userId:member.id}};
  assert.equal((await h.request("POST",{...remove,user:member})).code,403);
  assert.equal((await h.request("POST",{...remove,selected:{...store,id:"other"}})).code,404);
  const result = await h.request("POST",remove);
  assert.equal(result.code,200);
  assert.equal((await h.request("GET",{groupId,user:member})).code,404);
  const second = await h.request("POST",{body:input});
  assert.equal((await h.request("POST",{...remove,groupId:second.data.id,user:{id:"admin",role:"SUPER_ADMIN"}})).code,200);
});
