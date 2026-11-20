import React from "react";
const money=v=>v===null||v===undefined||v===""?"—":`${Number(v).toFixed(2)} €`;
export default function NativePromotionList({items=[],onToggle,readOnly=false}){return (
            <div className="promo-list">
              {items.map((p) => (
                <article key={p.id}>
                  <div>
                    <b>{p.productName}</b>{p.name && <small>{p.name}</small>}
                    <small>
                      {p.promotionType === "GIFT"
                        ? `Αγορά ${Number(p.saleQuantity)} + ${Number(p.bonusQuantity)} δωρεάν`
                        : p.offerMode === "DISCOUNT_PERCENT"
                          ? `-${Number(p.discountPercent)}%`
                          : p.offerMode === "DISCOUNT_AMOUNT"
                            ? `-${money(p.discountAmount)}`
                            : `Τιμή ${money(p.offerPrice)}`}
                    </small>
                    <small>
                      {new Date(p.validFrom).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})} →{" "}
                      {p.validUntil
                        ? new Date(p.validUntil).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})
                        : "χωρίς λήξη"}
                    </small>
                    <small>
                      {(p.stores || []).map((s) => s.name).join(", ")}
                    </small>
                  </div>
                  {!readOnly && <button
                    className={p.active ? "danger" : "secondary"}
                    onClick={() => onToggle(p)}
                  >
                    {p.active ? "Παύση" : "Ενεργοποίηση"}
                  </button>}
                </article>
              ))}
            </div>
);}
