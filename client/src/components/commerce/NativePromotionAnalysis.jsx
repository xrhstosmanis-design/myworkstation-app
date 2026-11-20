import React from 'react';
const money=value=>Number(value||0).toFixed(2)+' €';
export default function NativePromotionAnalysis({analysis,showRows=false}){
 return <><div className="pp-analysis"><b>Ανάλυση προσφορών από νέες πωλήσεις</b><span>Πωλήσεις {money(analysis.totals?.salesAmount)} · Εκπτώσεις {money(analysis.totals?.discountAmount)} · Επιστροφές {money(analysis.totals?.returnedAmount)}</span><small>{analysis.note}</small></div>{showRows&&<div className="staff-promotion-analysis-table"><table><thead><tr>{['Προϊόν','Πωλήσεις','Τεμάχια','Αξία','Έκπτωση','Επιστραφέντα τεμάχια','Αξία επιστροφών'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{analysis.items.map(row=><tr key={row.id}><td>{row.productName}</td><td>{Number(row.salesCount||0)}</td><td>{Number(row.soldQuantity||0)}</td><td>{money(row.salesAmount)}</td><td>{money(row.discountAmount)}</td><td>{Number(row.returnedQuantity||0)}</td><td>{money(row.returnedAmount)}</td></tr>)}</tbody></table></div>}</>;
}
