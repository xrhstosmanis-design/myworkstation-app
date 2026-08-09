import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import cloudV1Routes from "./routes/cloud-v1.js";
import cashControlRoutes from "./routes/cash-control.js";
import storeOperatorRoutes from "./routes/store-operators.js";
import storeTransactionRoutes from "./routes/store-transactions.js";
import ownerPaymentsRoutes from "./routes/owner-payments.js";
import ownerPaymentsImportRoutes from "./routes/owner-payments-import.js";
import ownerPaymentsImportPreviewRoutes from "./routes/owner-payments-import-preview.js";
import ownerShiftsRoutes from "./routes/owner-shifts.js";
import purchaseOrderRoutes from "./routes/purchase-orders.js";
import storePosRoutes from "./routes/store-pos.js";
import pilotReportRoutes from "./routes/pilot-report.js";
import commerceV1Routes from "./routes/commerce-v1.js";
import attendanceRoutes from "./routes/attendance.js";
import providerLogisticsRoutes from "./routes/provider-logistics.js";
import connectorObserverRoutes from "./routes/connector-observer.js";
import ownerProductRoutes from "./routes/owner-products.js";
import ownerProductActionRoutes from "./routes/owner-product-actions.js";
import masterCatalogPreviewRoutes from "./routes/master-catalog-preview.js";
import masterCatalogRoutes from "./routes/master-catalog.js";
import platformAdminRoutes from "./routes/platform-admin.js";
import katTestRoutes from "./routes/kat-test.js";
import platformOwnerSecurityRoutes from "./routes/platform-owner-security.js";
import platformAuditRoutes,{ensurePlatformAuditSchema,platformAuditCapture} from "./platform-commercial-audit.js";
import licenseRoutes from "./routes/license.js";
import mailRoutes from "./routes/mail.js";
import { auth } from "./middleware/auth.js";
import { commerceTenantGuard } from "./middleware/commerce-tenant-guard.js";
import { requireOwnerProductAccess } from "./middleware/owner-product-access.js";
import { requireCompanyModule,requireOperationalModuleByPath,requireStoreModule } from "./middleware/module-access.js";
import { ensurePlatformSchema } from "./platform-bootstrap.js";
import { ensureCommercialSchema } from "./commercial-bootstrap.js";
import { ensureExtendedModulesSchema } from "./extended-modules-bootstrap.js";
import { ensureCommerceCompatibility } from "./commerce-compatibility.js";
import { ensureMasterCatalogSchema } from "./master-catalog-bootstrap.js";
import { ensureOwnerProductSchema } from "./owner-product-bootstrap.js";
import { ensureProductDeliverySchema } from "./product-delivery-bootstrap.js";

if(!process.env.JWT_SECRET) throw new Error("Λείπει το JWT_SECRET.");

const app=express();
app.use(cors());
app.use(express.json({limit:"12mb"}));
app.get("/api/health",(_,res)=>res.json({ok:true,version:"0.22.0+kat-test-pos"}));
app.use("/api/auth",authRoutes);
app.use("/api/platform",auth,platformAuditCapture);
app.use("/api/platform",platformAuditRoutes);
app.use("/api/platform/master-catalog",masterCatalogPreviewRoutes);
app.use("/api/platform/master-catalog",masterCatalogRoutes);
app.use("/api/platform/kat-test",katTestRoutes);
app.use("/api/platform",platformOwnerSecurityRoutes);
app.use("/api/platform",platformAdminRoutes);
app.use("/api/platform/mail",mailRoutes);
app.use("/api/license",licenseRoutes);
app.use("/api/operators",requireStoreModule("STORE_MODE"),storeOperatorRoutes);
app.use("/api/transactions",auth,requireCompanyModule("CASH_CONTROL"),storeTransactionRoutes);
app.use("/api/owner-payments",auth,requireCompanyModule("CASH_CONTROL"),ownerPaymentsImportPreviewRoutes);
app.use("/api/owner-payments",auth,requireCompanyModule("CASH_CONTROL"),ownerPaymentsImportRoutes);
app.use("/api/owner-payments",auth,requireCompanyModule("CASH_CONTROL"),ownerPaymentsRoutes);
app.use("/api/owner-shifts",auth,requireCompanyModule("CASH_CONTROL"),ownerShiftsRoutes);
app.use("/api/purchase-orders",auth,requireCompanyModule("INVENTORY"),purchaseOrderRoutes);
app.use("/api/store-pos",auth,requireCompanyModule("STORE_MODE"),storePosRoutes);
app.use("/api/pilot",auth,requireCompanyModule("PILOT_REPORT"),pilotReportRoutes);
app.use("/api/cloud/v1",cloudV1Routes);
app.use("/api/cash",auth,requireCompanyModule("CASH_CONTROL"),cashControlRoutes);
app.use("/api/cash-control",auth,requireCompanyModule("CASH_CONTROL"),cashControlRoutes);
app.use("/api/owner-products",auth,requireOwnerProductAccess,ownerProductActionRoutes);
app.use("/api/owner-products",auth,requireOwnerProductAccess,ownerProductRoutes);
app.use("/api/commerce",auth,commerceTenantGuard,commerceV1Routes);
app.use("/api/attendance",auth,requireCompanyModule("ATTENDANCE"),attendanceRoutes);
app.use("/api/logistics",auth,requireCompanyModule("INVENTORY"),providerLogisticsRoutes);
app.use("/api/connector-observer",auth,requireCompanyModule("CONNECTOR_RBS"),connectorObserverRoutes);
app.use("/api",auth,requireOperationalModuleByPath,apiRoutes);

app.use((err,req,res,next)=>{
  console.error(err);
  if(err?.name==="ZodError") return res.status(400).json({error:"Ελέγξτε τα στοιχεία της φόρμας.",details:err.issues});
  if(err?.type==="entity.too.large")return res.status(413).json({error:"Το αρχείο είναι πολύ μεγάλο για εισαγωγή."});
  res.status(err?.status||500).json({error:err?.status?err.message:"Παρουσιάστηκε εσωτερικό σφάλμα."});
});

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const dist=path.resolve(__dirname,"../../client/dist");
app.use(express.static(dist));
app.get("*",(req,res,next)=>{
  if(req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist,"index.html"));
});

try{
  await ensurePlatformSchema();
  await ensurePlatformAuditSchema();
  await ensureCommercialSchema();
  await ensureExtendedModulesSchema();
  await ensureCommerceCompatibility();
  await ensureMasterCatalogSchema();
  await ensureOwnerProductSchema();
  await ensureProductDeliverySchema();
}catch(error){
  console.error("Platform/commercial schema bootstrap failed.",error);
  process.exit(1);
}

app.listen(process.env.PORT||8080,()=>console.log(`MyWorkStation v0.22.0 on port ${process.env.PORT||8080}`));
