import fs from "fs";

const path=new URL("./components/commerce/installOwnerShiftControlCenter.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="OWNER_SHIFTS_TRANSFER_UI_V1";
if(src.includes(marker)){
  console.log("Owner shifts transfer UI already installed.");
  process.exit(0);
}

const labelNeedle='const txLabel=type=>({SALE_CASH:"Πώληση μετρητών",SALE_CARD:"Πώληση κάρτας",SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Λοιπό έξοδο",PERCENTAGES:"Ποσοστά"}[type]||String(type||"Κίνηση"));';
if(!src.includes(labelNeedle))throw new Error("owner shifts transfer UI patch: label anchor not found");
src=src.replace(labelNeedle,`// ${marker}\nconst txLabel=type=>({SALE_CASH:"Πώληση μετρητών",SALE_CARD:"Πώληση κάρτας",SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Λοιπό έξοδο",TRANSFER_AMOUNT:"Μεταφορά ποσού",PERCENTAGES:"Ποσοστά"}[type]||String(type||"Κίνηση"));`);

const cardsNeedle='<article><small>Έξοδα βάρδιας</small><strong>${money(s.expenses)}</strong><span>Μόνο όσα αφαιρέθηκαν ρητά</span></article>';
if(!src.includes(cardsNeedle))throw new Error("owner shifts transfer UI patch: cards anchor not found");
src=src.replace(cardsNeedle,`${cardsNeedle}<article><small>Μεταφορές ποσού</small><strong>${money(s.transferIn)}</strong><span>Εισροές στην ενεργή βάρδια</span></article>`);

const summaryNeedle='<article><span>Μετρητά</span><b>${money(ds.cashSales)}</b><small>Λειτουργικό κλείσιμο ${money(ds.actualOperational)}</small></article>';
if(!src.includes(summaryNeedle))throw new Error("owner shifts transfer UI patch: summary anchor not found");
src=src.replace(summaryNeedle,`${summaryNeedle}<article><span>Μεταφορά ποσού</span><b>${money(ds.transferIn)}</b><small>Πραγματική εισροή στη βάρδια</small></article>`);

const moneyNeedle='<div class="osc-money-grid"><span>Μετρητά<b>${money(x.cashSales)}</b></span><span>Κάρτες<b>${money(x.cardSales)}</b></span><span>EFTPOS<b>${money(x.eftposTotal)}</b></span>';
if(!src.includes(moneyNeedle))throw new Error("owner shifts transfer UI patch: money anchor not found");
src=src.replace(moneyNeedle,'<div class="osc-money-grid"><span>Μετρητά<b>${money(x.cashSales)}</b></span><span>Μεταφορά ποσού<b>${money(x.transferIn)}</b><small>Εισροή βάρδιας</small></span><span>Κάρτες<b>${money(x.cardSales)}</b></span><span>EFTPOS<b>${money(x.eftposTotal)}</b></span>');

const differenceNeedle='<section><h3>3. Έξοδα</h3><div><span>Καταγεγραμμένα έξοδα<b>${money(recorded)}</b></span>';
if(!src.includes(differenceNeedle))throw new Error("owner shifts transfer UI patch: difference anchor not found");
src=src.replace(differenceNeedle,'<section><h3>3. Κινήσεις χρηματικού</h3><div><span>Μεταφορά ποσού / εισροή<b>${money(x.transferIn)}</b></span><span>Καταγεγραμμένα έξοδα<b>${money(recorded)}</b></span>');

fs.writeFileSync(path,src);
console.log("Owner shifts transfer UI installed.");
