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
import pilotReportRoutes from "./routes/pilot-report.js";
import commerceV1Routes from "./routes/commerce-v1.js";
import platformAdminRoutes from "./routes/platform-admin.js";
import platformOwnerSecurityRoutes from "./routes/platform-owner-security.js";
import platformAuditRoutes,{ensurePlatformAuditSchema,platformAuditCapture} from "./platform-commercial-audit.js";
import licenseRoutes from "./routes/license.js";
import { auth } from "./middleware/auth.js";
import { requireCompanyModule,requireOperationalModuleByPath,requireStoreModule } from "./middleware/module-access.js";
import { ensurePlatformSchema } from "./platform-bootstrap.js";
import { ensureCommercialSchema } from "./commercial-bootstrap.js";
import { ensureExtendedModulesSchema } from "./extended-modules-bootstrap.js";
import { ensureCommerceCompatibility } from "./commerce-compatibility.js";

if(!process.env.JWT_SECRET) throw new Error("Λείπει το JWT_SECRET.");

const app=express();
app.use(cors());
app.use(express.json());
app.get("/api/health",(_,res)=>res.json({ok:true,version:"0.18.0+modules-v1"}));
app.use("/api/auth",authRoutes);
app.use("/api/platform",auth,platformAuditCapture);
app.use("/api/platform",platformAuditRoutes);
app.use("/api/platform",platformOwnerSecurityRoutes);
app.use("/api/platform",platformAdminRoutes);
app.use("/api/license",licenseRoutes);
app.use("/api/operators",requireStoreModule("STORE_MODE"),storeOperatorRoutes);
app.use("/api/transactions",auth,requireCompanyModule("CASH_CONTROL"),storeTransactionRoutes);
app.use("/api/pilot",auth,requireCompanyModule("PILOT_REPORT"),pilotReportRoutes);
app.use("/api/cloud/v1",cloudV1Routes);
app.use("/api/cash",auth,requireCompanyModule("CASH_CONTROL"),cashControlRoutes);
app.use("/api/commerce",auth,commerceV1Routes);
app.use("/api",auth,requireOperationalModuleByPath,apiRoutes);

app.use((err,req,res,next)=>{
  console.error(err);
  if(err?.name==="ZodError") return res.status(400).json({error:"Ελέγξτε τα στοιχεία της φόρμας.",details:err.issues});
  res.status(500).json({error:"Παρουσιάστηκε εσωτερικό σφάλμα."});
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
}catch(error){
  console.error("Platform/commercial schema bootstrap failed.",error);
  process.exit(1);
}

app.listen(process.env.PORT||8080,()=>console.log(`MyWorkStation v0.18.0 on port ${process.env.PORT||8080}`));
