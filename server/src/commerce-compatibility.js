import {prisma} from "./prisma.js";

export async function ensureCommerceCompatibility(){
  // Barcodes are unique inside a customer's catalog through the parent Product company.
  // A global unique barcode would incorrectly block two different customers from using the same retail EAN/UPC.
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ProductBarcode_barcode_key"`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBarcode_barcode_idx" ON "ProductBarcode"("barcode")`);
  console.log("Commerce compatibility checks completed.");
}
