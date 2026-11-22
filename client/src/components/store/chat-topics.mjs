export const CHAT_TOPICS=Object.freeze([{id:"GENERAL",label:"Συνομιλία",icon:"☰"},{id:"CASH",label:"Ταμεία",icon:"€"},{id:"INVOICE",label:"Τιμολόγια",icon:"▤"}]);
export const chatTopic=category=>category==="CASH"||category==="SHIFT"?"CASH":category==="INVOICE"?"INVOICE":"GENERAL";
export const topicCategory=topic=>topic==="CASH"?"CASH":topic==="INVOICE"?"INVOICE":"GENERAL";
export const topicLabel=topic=>CHAT_TOPICS.find(item=>item.id===topic)?.label||"Συνομιλία";
