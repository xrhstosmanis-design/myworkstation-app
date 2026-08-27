const KEY="mwsKatOnlineCheckout";
export function setKatOnlineCheckout(order){if(!order?.id)throw new Error("Λείπει Online order id.");sessionStorage.setItem(KEY,JSON.stringify({id:String(order.id),orderNumber:String(order.orderNumber||""),deliveryFee:Number(order.deliveryFee||0),paymentMethod:String(order.paymentMethod||"").toUpperCase(),items:(order.items||[]).map(x=>({productId:String(x.productId||""),quantity:Number(x.quantity||1)})).filter(x=>x.productId)}));window.dispatchEvent(new CustomEvent("mws:kat-online-checkout"));}
export function getKatOnlineCheckout(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch{return null}}
export function clearKatOnlineCheckout(){sessionStorage.removeItem(KEY)}
