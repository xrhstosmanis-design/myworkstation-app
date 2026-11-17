import { Prisma } from "@prisma/client";

export const postedSupplierPayment=Prisma.sql`NOT EXISTS (SELECT 1 FROM "SupplierPaymentSettlement" ss WHERE ss."companyId"=t."companyId" AND ss."transactionId"=t."id" AND ss."status"<>'CONFIRMED')`;
