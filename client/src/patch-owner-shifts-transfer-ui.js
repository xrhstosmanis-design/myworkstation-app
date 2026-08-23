import fs from "fs";

const path=new URL("./components/commerce/installOwnerShiftControlCenter.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="OWNER_SHIFTS_TRANSFER_UI_V1";

// Safe build-time patch: every replacement is independently idempotent.
// This avoids breaking Render when part of the UI has already been patched.
if(src.includes(marker)){
  console.log("Owner shifts transfer UI already installed.");
  process.exit(0);
}

const replaceIfPresent=(needle,replacement,label)=>{
  if(src.includes(needle)){
    src=src.replace(needle,replacement);
    console.log(`Owner shifts transfer UI: patched ${label}.`);
    return true;
  }
  console.log(`Owner shifts transfer UI: ${label} already changed or anchor unavailable; skipped safely.`);
  return false;
};

const labelNeedle='const txLabel=type=>({SALE_CASH:"Πώληση μετρητών",SALE_CARD:"Πώληση κάρτας",SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Λοιπό έξοδο",PERCENTAGES:"Ποσοστά"}[type]||String(type||"Κίνηση"));';
replaceIfPresent(labelNeedle,`// ${marker}\nconst txLabel=type=>({SALE_CASH:"Πώληση μετρητών",SALE_CARD:"Πώληση κάρτας",SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Λοιπό έξοδο",TRANSFER_AMOUNT:"Μεταφορά ποσού",PERCENTAGES:"Ποσοστά"}[type]||String(type||"Κίνηση"));`,"transaction label");

const cardsNeedle='<article><small>Έξοδα βάρδιας</small><strong>${money(s.expenses)}</strong><span>Μόνο όσα αφαιρέθηκαν ρητά</span></article>';
if(!src.includes('Μεταφορές ποσού</small><strong>${money(s.transferIn)}'))replaceIfPresent(cardsNeedle,`${cardsNeedle}<article><small>Μεταφορές ποσού</small><strong>${money(s.transferIn)}</strong><span>Εισροές στην ενεργή βάρδια</span></article>`,"summary cards");

const summaryNeedle='<article><span>Μετρητά</span><b>${money(ds.cashSales)}</b><small>Λειτουργικό κλείσιμο ${money(ds.actualOperational)}</small></article>';
if(!src.includes('Μεταφορά ποσού</span><b>${money(ds.transferIn)}'))replaceIfPresent(summaryNeedle,`${summaryNeedle}<article><span>Μεταφορά ποσού</span><b>${money(ds.transferIn)}</b><small>Πραγματική εισροή στη βάρδια</small></article>`,"detail summary");

const moneyNeedle='<div class="osc-money-grid"><span>Μετρητά<b>${money(x.cashSales)}</b></span><span>Κάρτες<b>${money(x.cardSales)}</b></span><span>EFTPOS<b>${money(x.eftposTotal)}</b></span>';
if(!src.includes('Μεταφορά ποσού<b>${money(x.transferIn)}'))replaceIfPresent(moneyNeedle,'<div class="osc-money-grid"><span>Μετρητά<b>${money(x.cashSales)}</b></span><span>Μεταφορά ποσού<b>${money(x.transferIn)}</b><small>Εισροή βάρδιας</small></span><span>Κάρτες<b>${money(x.cardSales)}</b></span><span>EFTPOS<b>${money(x.eftposTotal)}</b></span>',"money analysis");

const differenceNeedle='<section><h3>3. Έξοδα</h3><div><span>Καταγεγραμμένα έξοδα<b>${money(recorded)}</b></span>';
if(!src.includes('3. Κινήσεις χρηματικού'))replaceIfPresent(differenceNeedle,'<section><h3>3. Κινήσεις χρηματικού</h3><div><span>Μεταφορά ποσού / εισροή<b>${money(x.transferIn)}</b></span><span>Καταγεγραμμένα έξοδα<b>${money(recorded)}</b></span>',"difference analysis");

// Add marker even if an older partial patch changed one of the anchors.
if(!src.includes(marker))src=`// ${marker}\n${src}`;
fs.writeFileSync(path,src);
console.log("Owner shifts transfer UI patch completed safely.");
