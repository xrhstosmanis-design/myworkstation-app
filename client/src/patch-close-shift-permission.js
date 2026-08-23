import fs from "fs";

const patches=[
  {
    path:new URL("./components/commerce/OperatorManagementPanel.jsx",import.meta.url),
    apply(src){
      if(src.includes('["closeShift","Κλείσιμο βάρδιας (PoS)"]'))return src;
      const needle='["centralCashPos","Εμφάνιση κεντρικού Ταμείου (PoS)"],["centralCashBackoffice","Εμφάνιση κεντρικού Ταμείου (BackOffice)"]';
      if(!src.includes(needle))throw new Error("close-shift permission: operator permission anchor not found");
      return src.replace(needle,'["centralCashPos","Εμφάνιση κεντρικού Ταμείου (PoS)"],["closeShift","Κλείσιμο βάρδιας (PoS)"],["centralCashBackoffice","Εμφάνιση κεντρικού Ταμείου (BackOffice)"]');
    }
  },
  {
    path:new URL("./components/store/StoreOperatorApp.jsx",import.meta.url),
    apply(src){
      if(src.includes('canCloseShift=Boolean(runtimeAccess?.closeShift)'))return src;
      const needle='canCloseShift=Boolean(runtimeAccess?.centralCashPos)';
      if(!src.includes(needle))throw new Error("close-shift permission: POS close button anchor not found");
      return src.replace(needle,'canCloseShift=Boolean(runtimeAccess?.closeShift)');
    }
  }
];

for(const patch of patches){
  const src=fs.readFileSync(patch.path,"utf8");
  const next=patch.apply(src);
  if(next!==src){fs.writeFileSync(patch.path,next);console.log(`Close shift permission patched: ${patch.path.pathname}`)}
  else console.log(`Close shift permission already installed: ${patch.path.pathname}`);
}
