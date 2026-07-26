import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";

if(!process.env.JWT_SECRET) throw new Error("Λείπει το JWT_SECRET.");

const app=express();
app.use(cors());
app.use(express.json());
app.get("/api/health",(_,res)=>res.json({ok:true,version:"0.5.0"}));
app.use("/api/auth",authRoutes);
app.use("/api",apiRoutes);

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

app.listen(process.env.PORT||8080,()=>console.log(`MyWorkStation v0.5 on port ${process.env.PORT||8080}`));
