import { prisma } from "./prisma.js";

// Internal KAT pilot fixtures only. This does NOT bypass commercial module
// checks globally: normal customer capability endpoints still read CompanyModule.
// It gives only the two known internal KAT test stores explicit entitlements
// required to exercise the real Standard/Premium supplier-invoice flows end-to-end.
const KAT_TEST_STORE_IDS = ["kat-store", "kat-test-store"];
const KAT_TEST_MODULES = ["AI_READER", "CASH_CONTROL", "STORE_MODE", "INVENTORY"];

export async function ensureKatAiReaderTestEntitlement() {
  const stores = await prisma.store.findMany({
    where: { id: { in: KAT_TEST_STORE_IDS }, active: true },
    select: { id: true, companyId: true, name: true },
  });

  const companies = [...new Set(stores.map((store) => store.companyId).filter(Boolean))];
  for (const companyId of companies) {
    for (const moduleKey of KAT_TEST_MODULES) {
      await prisma.companyModule.upsert({
        where: { companyId_moduleKey: { companyId, moduleKey } },
        update: {
          active: true,
          startsAt: null,
          endsAt: null,
          notes: "KAT TEST/PILOT · πραγματικές δοκιμές Standard/Premium",
        },
        create: {
          companyId,
          moduleKey,
          active: true,
          startsAt: null,
          endsAt: null,
          notes: "KAT TEST/PILOT · πραγματικές δοκιμές Standard/Premium",
        },
      });
    }
  }

  return { stores: stores.map((store) => store.id), companies, modules: KAT_TEST_MODULES };
}
