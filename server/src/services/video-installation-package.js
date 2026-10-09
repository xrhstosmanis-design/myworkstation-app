import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

export const hikvisionPrecheckPackage=Object.freeze({
 filename:"MyWorkStation_Hikvision_Precheck.zip",version:"1.0.0",size:5681,
 sha256:"a4355d9e0a9b4589083183225383dfc5cf13fb4e386461790ad252ff6055e931"
});
const packageUrl=new URL("../../../output/hikvision/MyWorkStation_Hikvision_Precheck.zip",import.meta.url);

export async function sendHikvisionPrecheck(res,{read=readFile}={}){
 let bytes;
 try{
  bytes=await read(packageUrl);
  if(bytes.length!==hikvisionPrecheckPackage.size||createHash("sha256").update(bytes).digest("hex")!==hikvisionPrecheckPackage.sha256)throw new Error("Package integrity mismatch");
 }catch{
  return res.status(503).json({error:"Το πακέτο ελέγχου δεν είναι διαθέσιμο. Δοκίμασε ξανά αργότερα."});
 }
 res.setHeader("Content-Type","application/zip");
 res.setHeader("Content-Disposition",`attachment; filename="${hikvisionPrecheckPackage.filename}"`);
 res.setHeader("Cache-Control","private, no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Content-Length",String(bytes.length));
 return res.send(bytes);
}
