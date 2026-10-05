import {readFile} from "node:fs/promises";
import {buildRbsInstallationPackage} from "./rbs-installation-package.js";

// Keep the legacy package and the fiscal scripts unchanged. Only wrap preparation.
export async function buildRbsGuidedInstallationPackage(options){
  const legacy=await buildRbsInstallationPackage(options);
  const root=new URL("../../../tools/windows-rbs-capdriver-v1/",import.meta.url);
  const files=Object.fromEntries(await Promise.all(["Guided-Setup.ps1","Connector-Tools.ps1","Start-Connector.ps1"].map(async name=>{
    const source=await readFile(new URL(name,root));
    const bom=Buffer.from([0xef,0xbb,0xbf]);
    return [name,(source.subarray(0,3).equals(bom)?source:Buffer.concat([bom,source])).toString("base64")];
  })));
  const template=await readFile(new URL("Remote-Install.template.cmd",root),"utf8");
  return {...legacy,fileName:legacy.fileName.replace("-Install-","-Remote-Setup-").replace(/\.ps1$/,".cmd"),
    script:template.replace("__LEGACY_BASE64__",Buffer.from(legacy.script).toString("base64"))
      .replace("__GUIDED_FILES_BASE64__",Buffer.from(JSON.stringify(files)).toString("base64")).replace(/\r?\n/g,"\r\n"),
    guided:true,startsWriterAutomatically:false};
}
