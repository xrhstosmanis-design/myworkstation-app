import { prisma } from "../src/prisma.js";

// Legacy Kiosk Manager screenshot: department 2 (press) was excluded from
// this catalogue. Department 7 (services) has no legacy VAT code shown.
const companyId = "cmulmjjoa000oqlbfyi0h53ju";
const mapping = [
  {name:"3. ΚΑΡΤΕΣ ΚΙΝΗΤΗΣ",rate:0,register:3,code:"45"},
  {name:"04.ΕΙΔΗ 6",rate:6,register:4,code:"21"},
  {name:"5.ΕΙΔΗ 13",rate:13,register:5,code:"42"},
  {name:"ΕΙΔΗ 24",rate:24,register:6,code:"15"},
  {name:"7. ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΑΣ",rate:24,register:7,code:null},
  {name:"8.ΕΙΣΙΤΗΡΙΑ",rate:0,register:8,code:"62"},
  {name:"ΣΚΡΑΤΣ ΞΥΣΤΟ",rate:0,register:9,code:"63"}
];

try {
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw`
      SELECT d."id",d."description",d."vatRate",d."cashRegisterDepartment",d."legacyVatCode",
        (SELECT COUNT(*)::int FROM "Product" p WHERE p."vatDepartmentId"=d."id"
          AND p."companyId"=d."companyId") AS products,
        (SELECT COUNT(*)::int FROM "Product" p WHERE p."vatDepartmentId"=d."id"
          AND p."companyId"=d."companyId" AND p."vatRate"<>d."vatRate") AS mismatches
      FROM "ManagementVatDepartment" d
      WHERE d."companyId"=${companyId}
      ORDER BY d."description" FOR UPDATE OF d`;
    if (!rows.length) return; // Other environments do not have this company.
    for (const target of mapping) {
      const matches=rows.filter(row=>row.description===target.name);
      if (matches.length!==1) throw new Error(`Diadoxou register mapping: expected one ${target.name}`);
      const row=matches[0];
      if (Number(row.vatRate)!==target.rate || row.mismatches!==0 || row.products===0)
        throw new Error(`Diadoxou register mapping: VAT/product mismatch for ${target.name}`);
      if (row.cashRegisterDepartment!==null && row.cashRegisterDepartment!==target.register)
        throw new Error(`Diadoxou register mapping: existing register number differs for ${target.name}`);
      if (row.legacyVatCode!==null && row.legacyVatCode!==target.code)
        throw new Error(`Diadoxou register mapping: existing code differs for ${target.name}`);
    }
    for (const target of mapping) {
      const row=rows.find(item=>item.description===target.name);
      if (row.cashRegisterDepartment===target.register && row.legacyVatCode===target.code) continue;
      await tx.$executeRaw`
        UPDATE "ManagementVatDepartment" SET "cashRegisterDepartment"=${target.register},
          "legacyVatCode"=${target.code},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;
    }
  });
  console.log("Diadoxou register department mappings checked.");
} finally {
  await prisma.$disconnect();
}
