import {readFile} from 'node:fs/promises';
import {ftextSettingsHash} from './ftext-installation.js';
export async function buildFtextInstallationPackage({store,settings,apiBase,revision='unknown'}){
 const url=new URL(apiBase);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Απαιτείται η επίσημη HTTPS διεύθυνση εφαρμογής.');
 if(!settings||settings.companyId!==store.companyId||settings.storeId!==store.id)throw new Error('Οι ρυθμίσεις δεν αντιστοιχούν στο επιλεγμένο κατάστημα.');
 const settingsHash=ftextSettingsHash(settings),root=new URL('../../../tools/windows-ftext/',import.meta.url);
 const names=['Ftext.psm1','Cloud-Tools.psm1','Pair.ps1','Cloud-Test.ps1','Cloud-Connector.ps1','Setup.ps1','Cash.psm1'];
 const files=Object.fromEntries(await Promise.all(names.map(async name=>[name,(await readFile(new URL(name,root))).toString('base64')])));
 const config={...settings,settingsHash,apiBase:url.origin,storeName:store.name,revision};
 const template=await readFile(new URL('Install.template.cmd',root),'utf8');
 return {fileName:`MyWorkStation-Ftext-${settings.terminalPos}.cmd`,script:template.replace('__CONFIG_BASE64__',Buffer.from(JSON.stringify(config)).toString('base64')).replace('__FILES_BASE64__',Buffer.from(JSON.stringify(files)).toString('base64')).replace(/\r?\n/g,'\r\n'),containsCredentials:false,startsConnectorAutomatically:false,fiscalCheckoutEnabled:false};
}
