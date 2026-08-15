import { prisma } from "./prisma.js";

// Internal KAT pilot fixtures only. This does NOT bypass commercial module
// checks globally: the normal POS capability endpoint still reads CompanyModule.
// It simply gives the two known internal KAT test stores an explicit AI_READER
// entitlement so the real paid-module flow can be exercised end-to-end.
const KAT_TEST_STORE_IDS = ["kat-store", "kat-test-store"];

export async function ensureKatAiReaderTestEntitlement() {
  const stores = await prisma.store.findMany({
    where: { id: { in: KAT_TEST_STORE_IDS }, active: true },
    select: { id: true, companyId: true, name: true },
  });

  const companies = [...new Set(stores.map((store) => store.companyId).filter(Boolean))];
  for (const companyId of companies) {
    await prisma.companyModule.upsert({
      where: { companyId_moduleKey: { companyId, moduleKey: "AI_READER" } },
      update: {
        active: true,
        notes: "KAT TEST/PILOT · Αυτόματη καταχώρηση τιμολογίων",
      },
      create: {
        companyId,
        moduleKey: "AI_READER",
        active: true,
        notes: "KAT TEST/PILOT · Αυτόματη καταχώρηση τιμολογίων",
      },
    });
  }

  return { stores: stores.map((store) => store.id), companies };
}
