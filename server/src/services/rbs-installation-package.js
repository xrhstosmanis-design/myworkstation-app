import {readFile} from "node:fs/promises";

export async function buildRbsInstallationPackage({store,settings,apiBase,revision="unknown"}){
  const uri=new URL(apiBase);
  if(uri.protocol!=="https:"||uri.username||uri.password||uri.pathname!=="/"||uri.search||uri.hash)throw new Error("Το πακέτο απαιτεί HTTPS διεύθυνση εφαρμογής χωρίς κωδικούς ή διαδρομή.");
  if(!settings||settings.storeId!==store.id||settings.companyId!==store.companyId)throw new Error("Λείπουν οι επιβεβαιωμένες ρυθμίσεις CAPDriver για αυτό το κατάστημα.");
  const root=new URL("../../../tools/windows-rbs-capdriver-v1/",import.meta.url);
  const files=Object.fromEntries(await Promise.all(["Pair.ps1","Test-Connection.ps1","Writer.ps1"].map(async name=>[name,(await readFile(new URL(name,root))).toString("base64")])));
  const config={storeId:store.id,storeName:store.name,terminalPos:settings.terminalPos,workFolder:settings.workFolder,apiBase:uri.origin,revision};
  const template=await readFile(new URL("Install.template.ps1",root),"utf8");
  const encode=value=>Buffer.from(JSON.stringify(value),"utf8").toString("base64");
  return {fileName:`MyWorkStation-Install-${settings.terminalPos}.ps1`,script:template.replace("__CONFIG_BASE64__",encode(config)).replace("__FILES_BASE64__",encode(files)),revision,containsCredentials:false};
}
