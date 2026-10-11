import React from "react";
export default function MobileDocumentPhotosQr({mobile}){
  return mobile.pending?<div style={{textAlign:"center",padding:10}}>{mobile.qr?<><img src={mobile.qr} alt="QR upload τιμολογίου" style={{width:180}}/><div>Σκάναρε και πρόσθεσε έως 5 φωτογραφίες του ίδιου παραστατικού. Πάτησε «Αποστολή όλων» στο κινητό.</div></>:<div>Δημιουργία QR…</div>}<button type="button" onClick={mobile.cancel}>Ακύρωση QR</button></div>:null;
}
