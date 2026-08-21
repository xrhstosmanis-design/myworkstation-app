import { prisma } from "./prisma.js";

// Internal KAT pilot fixtures only. This does NOT bypass commercial module
// checks globally: normal customer capability endpoints still read CompanyModule.
// Resolve the pilot by the known fixture ids OR by the exact KAT store name,
// but only for companies whose plan is PILOT. This avoids depending on a single
// historical store id while keeping normal customer licensing untouched.
const KAT_TEST_STORE_IDS = ["kat-store", "kat-test-store"];
const KAT_TEST_STORE_NAME = "Κυλικείο ΚΑΤ";
const KAT_TEST_MODULES = ["AI_READER", "CASH_CONTROL", "STORE_MODE", "INVENTORY", "ADVANCED_ONLINE_PRODUCT_SEARCH"];

export async function ensureKatAiReaderTestEntitlement() {
  const activeStores = await prisma.store.findMany({
    where: { active: true },
    select: { id: true, companyId: true, name: true },
  });

  const candidateStores = activeStores.filter((store) =>
    KAT_TEST_STORE_IDS.includes(String(store.id)) || String(store.name || "").trim() === KAT_TEST_STORE_NAME
  );
  const candidateCompanyIds = [...new Set(candidateStores.map((store) => store.companyId).filter(Boolean))];
  const pilotCompanies = candidateCompanyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: candidateCompanyIds }, plan: "PILOT", active: true },
        select: { id: true },
      })
    : [];
  const pilotCompanyIds = new Set(pilotCompanies.map((company) => company.id));
  const stores = candidateStores.filter((store) => pilotCompanyIds.has(store.companyId));
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