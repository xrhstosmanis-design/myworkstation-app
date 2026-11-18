import {prisma} from "./prisma.js";
import {chatTopic} from "./chat-topics.mjs";

export async function ensureChatNotificationPreferences() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreChatMutedTopic" (
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    PRIMARY KEY ("companyId", "storeId", "topic", "userId")
  )`);
}

export async function mutedChatUsers(store, topic) {
  if (!topic) return new Set();
  const rows = await prisma.$queryRaw`
    SELECT "userId" FROM "StoreChatMutedTopic"
    WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "topic"=${chatTopic(topic)}
  `;
  return new Set(rows.map(row => row.userId));
}

export async function setChatTopicMuted(store, userId, topic, muted) {
  if (!chatTopic(topic) || typeof muted !== "boolean") {
    throw Object.assign(new Error("Μη έγκυρη ρύθμιση ειδοποιήσεων."), {status: 400});
  }
  if (muted) {
    await prisma.$executeRaw`
      INSERT INTO "StoreChatMutedTopic" ("companyId", "storeId", "userId", "topic")
      VALUES (${store.companyId}, ${store.id}, ${userId}, ${topic}) ON CONFLICT DO NOTHING
    `;
  } else {
    await prisma.$executeRaw`
      DELETE FROM "StoreChatMutedTopic"
      WHERE "companyId"=${store.companyId} AND "storeId"=${store.id}
        AND "userId"=${userId} AND "topic"=${topic}
    `;
  }
}
