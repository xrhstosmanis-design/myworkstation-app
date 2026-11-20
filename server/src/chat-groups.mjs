import {randomUUID} from "node:crypto";

const MAX_GROUP_MEMBERS = 100;
const MAX_GROUP_NAME = 80;
const MAX_MESSAGE = 5000;

function invalid(message, status = 400) {
  return Object.assign(new Error(message), {status});
}

export async function ensureChatGroups(db) {
  await db.$executeRaw`CREATE TABLE IF NOT EXISTS "StoreChatGroup" (
    "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL, "createdBy" TEXT NOT NULL
  )`;
  await db.$executeRaw`CREATE INDEX IF NOT EXISTS "StoreChatGroup_scope_idx"
    ON "StoreChatGroup" ("companyId", "storeId", "name")`;
  await db.$executeRaw`CREATE TABLE IF NOT EXISTS "StoreChatGroupMember" (
    "groupId" TEXT NOT NULL REFERENCES "StoreChatGroup" ("id") ON DELETE CASCADE,
    "userId" TEXT NOT NULL, PRIMARY KEY ("groupId", "userId")
  )`;
  await db.$executeRaw`CREATE TABLE IF NOT EXISTS "StoreChatGroupMessage" (
    "id" TEXT PRIMARY KEY, "groupId" TEXT NOT NULL REFERENCES "StoreChatGroup" ("id") ON DELETE CASCADE,
    "senderId" TEXT NOT NULL, "senderName" TEXT NOT NULL, "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
  )`;
  await db.$executeRaw`CREATE INDEX IF NOT EXISTS "StoreChatGroupMessage_timeline_idx"
    ON "StoreChatGroupMessage" ("groupId", "createdAt", "id")`;
}

export async function chatGroupRoster(db, store) {
  return db.$queryRaw`SELECT c."id", c."displayName" AS "name"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId" AND e."active"=TRUE
    JOIN "Store" s ON s."id"=c."storeId" AND s."companyId"=c."companyId" AND s."active"=TRUE
    JOIN "Company" company ON company."id"=s."companyId" AND company."active"=TRUE
    WHERE c."companyId"=${store.companyId} AND c."storeId"=${store.id}
      AND c."active"=TRUE AND c."pinHash" IS NOT NULL
    ORDER BY c."displayName", c."id"`;
}

async function listGroups(db, store, userId) {
  return db.$queryRaw`SELECT g."id", g."name"
    FROM "StoreChatGroup" g JOIN "StoreChatGroupMember" m ON m."groupId"=g."id"
    WHERE g."companyId"=${store.companyId} AND g."storeId"=${store.id} AND m."userId"=${userId}
    ORDER BY g."name", g."id"`;
}

async function createGroup(db, store, userId, input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const memberIds = input?.memberIds;
  if (!name || name.length > MAX_GROUP_NAME || !Array.isArray(memberIds) ||
      !memberIds.length || memberIds.length > MAX_GROUP_MEMBERS ||
      memberIds.some(id => typeof id !== "string" || !id)) {
    throw invalid("Δώσε όνομα ομάδας και επίλεξε προσωπικό.");
  }
  const selected = [...new Set(memberIds)];
  const id = randomUUID();
  await db.$transaction(async tx => {
    const eligible = new Set((await chatGroupRoster(tx, store)).map(member => member.id));
    if (selected.some(memberId => !eligible.has(memberId))) {
      throw invalid("Ένας ή περισσότεροι υπάλληλοι δεν είναι διαθέσιμοι για Chat στο κατάστημα.");
    }
    await tx.$executeRaw`INSERT INTO "StoreChatGroup" ("id","companyId","storeId","name","createdBy")
      VALUES (${id},${store.companyId},${store.id},${name},${userId})`;
    const members = [...new Set([userId, ...selected])];
    await tx.$executeRaw`INSERT INTO "StoreChatGroupMember" ("groupId","userId")
      SELECT ${id}, member_id FROM unnest(${members}::text[]) AS member(member_id)`;
  });
  return {id, name};
}

async function groupHistory(db, store, groupId, userId) {
  const rows = await db.$queryRaw`SELECT g."id", messages."id" AS "messageId", messages."senderId",
    messages."senderName", messages."body", messages."createdAt"
    FROM "StoreChatGroup" g JOIN "StoreChatGroupMember" m ON m."groupId"=g."id"
    LEFT JOIN LATERAL (
      SELECT "id", "senderId", "senderName", "body", "createdAt" FROM "StoreChatGroupMessage"
      WHERE "groupId"=g."id" ORDER BY "createdAt" DESC, "id" DESC LIMIT 100
    ) messages ON TRUE
    WHERE g."companyId"=${store.companyId} AND g."storeId"=${store.id} AND g."id"=${groupId} AND m."userId"=${userId}
    ORDER BY messages."createdAt", messages."id"`;
  if (!rows.length) throw invalid("Δεν βρέθηκε ομάδα Chat.", 404);
  return rows.filter(row => row.messageId).map(({messageId, senderId, senderName, body, createdAt}) =>
    ({id:messageId, senderName, body, createdAt, ownMessage:senderId===userId}));
}

async function sendGroupMessage(db, store, groupId, user, input) {
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!body || body.length > MAX_MESSAGE) throw invalid("Το μήνυμα της ομάδας δεν είναι έγκυρο.");
  const id = typeof input?.requestId === "string" ? input.requestId : "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw invalid("Λείπει ο κωδικός αποστολής του μηνύματος.");
  }
  const senderName = user.fullName || user.name || "Χρήστης";
  const inserted = await db.$executeRaw`INSERT INTO "StoreChatGroupMessage" ("id","groupId","senderId","senderName","body")
    SELECT ${id}, g."id", ${user.id}, ${senderName}, ${body}
    FROM "StoreChatGroup" g JOIN "StoreChatGroupMember" m ON m."groupId"=g."id"
    WHERE g."companyId"=${store.companyId} AND g."storeId"=${store.id} AND g."id"=${groupId} AND m."userId"=${user.id}
    ON CONFLICT ("id") DO NOTHING`;
  if (inserted) return {id, replayed:false};

  const existing = await db.$queryRaw`SELECT message."body" FROM "StoreChatGroupMessage" message
    JOIN "StoreChatGroup" g ON g."id"=message."groupId"
    JOIN "StoreChatGroupMember" m ON m."groupId"=g."id"
    WHERE g."companyId"=${store.companyId} AND g."storeId"=${store.id} AND g."id"=${groupId}
      AND message."id"=${id} AND message."senderId"=${user.id} AND m."userId"=${user.id}`;
  if (!existing.length) throw invalid("Δεν βρέθηκε ομάδα Chat.", 404);
  if (existing[0].body !== body) throw invalid("Ο κωδικός αποστολής αντιστοιχεί σε άλλο μήνυμα.", 409);
  return {id, replayed:true};
}

export function mountChatGroups(router, {db, selectStore, checkModule, canManage, canModerate = () => false, auditModeration}) {
  const base = "/stores/:storeId/groups";
  const handler = operation => async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store, private");
      const store = await selectStore(req, res);
      if (!store || !await checkModule(req, res, store.id)) return;
      const active = await db.store.findFirst({
        where:{id:store.id, companyId:store.companyId, active:true, company:{active:true}},
        select:{id:true},
      });
      if (!active) throw invalid("Δεν βρέθηκε ενεργό κατάστημα.", 404);
      await operation(req, res, store);
    } catch (error) {
      next(error);
    }
  };
  router.get(base, handler(async (req, res, store) => {
    const mayCreate = canManage(req.user);
    const groups = await listGroups(db, store, req.user.id);
    const members = mayCreate ? await chatGroupRoster(db, store) : [];
    res.json({groups, mayCreate, members, ...(canModerate(req.user) ? {mayModerate:true} : {})});
  }));
  router.post(base, handler(async (req, res, store) => {
    if (!canManage(req.user)) throw invalid("Δεν έχεις δικαίωμα δημιουργίας ομάδας Chat.", 403);
    res.status(201).json(await createGroup(db, store, req.user.id, req.body));
  }));
  router.get(`${base}/moderation`, handler(async (req, res, store) => {
    if (!canModerate(req.user)) throw invalid("Δεν έχεις δικαίωμα διαχείρισης μελών Chat.", 403);
    const groups = await db.$queryRaw`SELECT g."id", g."name", m."userId",
      COALESCE(c."displayName", u."fullName", 'Χρήστης') AS "memberName"
      FROM "StoreChatGroup" g
      LEFT JOIN "StoreChatGroupMember" m ON m."groupId"=g."id"
      LEFT JOIN "StoreOperatorCredential" c ON c."id"=m."userId"
        AND c."storeId"=g."storeId" AND c."companyId"=g."companyId"
      LEFT JOIN "User" u ON u."id"=m."userId"
      WHERE g."companyId"=${store.companyId} AND g."storeId"=${store.id}
      ORDER BY g."name", g."id", "memberName", m."userId"`;
    res.json({groups});
  }));
  router.post(`${base}/:groupId/remove-member`, handler(async (req, res, store) => {
    if (!canModerate(req.user)) throw invalid("Δεν έχεις δικαίωμα διαχείρισης μελών Chat.", 403);
    const groupId = req.params.groupId;
    const userId = req.body?.userId;
    if (typeof userId !== "string" || !userId || userId.length > 120) throw invalid("Μη έγκυρο μέλος Chat.");
    await db.$transaction(async tx => {
      const removed = await tx.$executeRaw`DELETE FROM "StoreChatGroupMember" m USING "StoreChatGroup" g
        WHERE m."groupId"=g."id" AND m."userId"=${userId} AND g."id"=${groupId}
          AND g."companyId"=${store.companyId} AND g."storeId"=${store.id}`;
      if (removed !== 1) throw invalid("Δεν βρέθηκε το μέλος σε αυτή την ομάδα.", 404);
      await auditModeration(req, store, "STORE_CHAT_GROUP_MEMBER_REMOVED", {groupId,userId}, tx);
    });
    res.json({ok:true});
  }));
  router.get(`${base}/:groupId/messages`, handler(async (req, res, store) => {
    res.json({messages:await groupHistory(db, store, req.params.groupId, req.user.id)});
  }));
  router.post(`${base}/:groupId/messages`, handler(async (req, res, store) => {
    const result = await sendGroupMessage(db, store, req.params.groupId, req.user, req.body);
    res.status(result.replayed ? 200 : 201).json(result);
  }));
}
