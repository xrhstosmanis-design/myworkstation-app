import fs from "fs";

const patchFile=(url,changes)=>{
  const path=new URL(url,import.meta.url);
  let src=fs.readFileSync(path,"utf8");
  let changed=false;
  for(const {from,to,label} of changes){
    if(src.includes(to)){
      console.log(`close-shift permission: ${label} already installed`);
      continue;
    }
    if(!src.includes(from)){
      console.log(`close-shift permission: ${label} anchor unavailable; skipped safely`);
      continue;
    }
    src=src.replace(from,to);
    changed=true;
    console.log(`close-shift permission: patched ${label}`);
  }
  if(changed)fs.writeFileSync(path,src);
};

patchFile("./components/commerce/OperatorManagementPanel.jsx",[
  {
    label:"BackOffice permission checkbox",
    from:'["cash","Μετρητά"],["initialCash","με αρχικό Ταμείο"],["cards","Κάρτες"]',
    to:'["cash","Μετρητά"],["initialCash","με αρχικό Ταμείο"],["closeShift","Κλείσιμο βάρδιας (PoS)"],["cards","Κάρτες"]'
  }
]);

patchFile("./components/store/StoreOperatorApp.jsx",[
  {
    label:"POS close-shift access",
    from:'canCloseShift=Boolean(runtimeAccess?.centralCashPos)',
    to:'canCloseShift=Boolean(runtimeAccess?.closeShift)'
  }
]);

console.log("Dedicated close-shift permission patch completed.");
