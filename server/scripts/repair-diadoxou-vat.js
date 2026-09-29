import { prisma } from "../src/prisma.js";

// One-time, guarded repair of the imported Diadoxou catalogue. The legacy
// register uses department 1 / code 12 for the zero-rate tobacco category.
const companyId = "cmulmjjoa000oqlbfyi0h53ju";

try {
  await prisma.$transaction(async tx => {
    const departments = await tx.$queryRaw`
      SELECT "id", "description", "vatRate", "cashRegisterDepartment", "legacyVatCode"
      FROM "ManagementVatDepartment" WHERE "companyId"=${companyId}
        AND "description" IN ('1.ΚΑΠΝΙΚΑ', 'ΕΙΔΗ 24') FOR UPDATE`;
    if (!departments.length) return; // This company is absent in other environments.
    const tobacco = departments.find(d => d.description === "1.ΚΑΠΝΙΚΑ");
    const standard = departments.find(d => d.description === "ΕΙΔΗ 24");
    if (!tobacco || !standard || Number(standard.vatRate) !== 24)
      throw new Error("Diadoxou VAT repair: expected departments are missing or changed");

    const state = await tx.$queryRaw`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c."name"='ΚΑΠΝΙΚΑ' AND p."vatRate"=0)::int AS tobacco,
        COUNT(*) FILTER (WHERE c."name" IS DISTINCT FROM 'ΚΑΠΝΙΚΑ' AND p."vatRate"=24)::int AS other
      FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      WHERE p."companyId"=${companyId} AND p."vatDepartmentId"=${tobacco.id}`;
    const {total, tobacco:zeroCount, other} = state[0];
    if (total === 565 && zeroCount === 565 && other === 0 && Number(tobacco.vatRate) === 0 &&
        tobacco.cashRegisterDepartment === 1 && tobacco.legacyVatCode === "12") return;
    if (total !== 585 || zeroCount !== 565 || other !== 20 || Number(tobacco.vatRate) !== 24 ||
        tobacco.cashRegisterDepartment !== null || tobacco.legacyVatCode !== null)
      throw new Error(`Diadoxou VAT repair: unexpected data (${total}/${zeroCount}/${other}); no changes made`);

    const moved = await tx.$executeRaw`
      UPDATE "Product" p SET "vatDepartmentId"=${standard.id}, "updatedAt"=CURRENT_TIMESTAMP
      FROM "ProductCategory" c WHERE c."id"=p."categoryId" AND p."companyId"=${companyId}
        AND p."vatDepartmentId"=${tobacco.id} AND c."name" <> 'ΚΑΠΝΙΚΑ' AND p."vatRate"=24`;
    if (moved !== 20) throw new Error(`Diadoxou VAT repair: moved ${moved}, expected 20`);
    await tx.$executeRaw`
      UPDATE "ManagementVatDepartment" SET "vatRate"=0, "legacyVatCode"='12',
        "cashRegisterDepartment"=1, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${tobacco.id}`;
  });
  console.log("Diadoxou VAT department 1 checked/repaired.");
} finally {
  await prisma.$disconnect();
}
