import React from "react";

const moneyInput=value=>value===null||value===undefined?"":String(Number(value));

export const deliveryDefaults=row=>({
  isModifier:Boolean(row?.isModifier),
  modifierGroup:row?.modifierGroup||"",
  isService:Boolean(row?.isService),
  eDeliveryEnabled:Boolean(row?.eDeliveryEnabled),
  efoodEnabled:Boolean(row?.efoodEnabled),
  woltEnabled:Boolean(row?.woltEnabled),
  publishStock:Boolean(row?.publishStock),
  publishPrices:Boolean(row?.publishPrices),
  efoodPrice:moneyInput(row?.efoodPrice),
  woltPrice:moneyInput(row?.woltPrice)
});

export default function ProductDeliveryFields({draft,onChange}){
  if(!draft)return null;
  const check=(key,label)=><label className="mws-delivery-check"><input type="checkbox" checked={Boolean(draft[key])} onChange={e=>onChange(key,e.target.checked)}/><span>{label}</span></label>;
  return <section className="mws-delivery-section">
    <div className="mws-delivery-title"><div><b>Modifiers & E‑Delivery</b><small>Ρυθμίσεις είδους για online delivery και μελλοντικές συνδέσεις efood / Wolt.</small></div></div>
    <div className="mws-delivery-checks">
      {check("isModifier","Ανήκει σε Modifier")}
      {check("isService","Υπηρεσία / μη αποθηκευτικό είδος")}
      {check("eDeliveryEnabled","Ενεργό στο E‑Delivery")}
      {check("efoodEnabled","Ενεργό στο efood")}
      {check("woltEnabled","Ενεργό στο Wolt")}
      {check("publishStock","Δημοσίευση Stock")}
      {check("publishPrices","Δημοσίευση Τιμών")}
    </div>
    <div className="mws-delivery-grid">
      <label>Ομάδα Modifier<input value={draft.modifierGroup||""} onChange={e=>onChange("modifierGroup",e.target.value)} placeholder="π.χ. Επιλογή γάλακτος"/></label>
      <label>Τιμή efood<input type="number" min="0" step="0.01" value={draft.efoodPrice??""} onChange={e=>onChange("efoodPrice",e.target.value)} placeholder="Χρήση βασικής τιμής αν είναι κενό"/></label>
      <label>Τιμή Wolt<input type="number" min="0" step="0.01" value={draft.woltPrice??""} onChange={e=>onChange("woltPrice",e.target.value)} placeholder="Χρήση βασικής τιμής αν είναι κενό"/></label>
    </div>
    <p className="mws-delivery-note">Οι επιλογές αποθηκεύονται ως ρυθμίσεις προϊόντος. Η πραγματική αποστολή stock/τιμών προς efood ή Wolt θα ενεργοποιείται μόνο όταν συνδεθεί ο αντίστοιχος connector/API.</p>
  </section>;
}
