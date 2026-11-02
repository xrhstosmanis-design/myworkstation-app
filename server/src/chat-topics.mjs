// Topics partition existing categories; they never recategorize historical messages.
const fail=()=>Object.assign(new Error('Μη έγκυρη ενότητα συνομιλίας ή κατηγορία.'),{status:400});
export const CHAT_TOPICS=Object.freeze(['GENERAL','CASH','INVOICE']);
export const CHAT_CATEGORIES=Object.freeze(['GENERAL','SHIFT','CASH','INVOICE','PAYMENT','STOCK_SHORTAGE','EQUIPMENT','ORDER','ANNOUNCEMENT','INCIDENT']);
export function chatTopic(value){
 if(value===undefined)return null;
 if(typeof value!=='string'||!CHAT_TOPICS.includes(value))throw fail();
 return value;
}
export function categoryTopic(category){return category==='CASH'||category==='SHIFT'?'CASH':category==='INVOICE'?'INVOICE':'GENERAL';}
export function topicRow(row){return {...row,topic:categoryTopic(row.category),...(row.replyTo?{replyTo:{...row.replyTo,topic:categoryTopic(row.replyTo.category)}}:{})};}
export function resolveChatCategory({topic:rawTopic,category,parentCategory}={}){
 const topic=chatTopic(rawTopic),value=category===undefined?'GENERAL':category;
 if(typeof value!=='string'||!CHAT_CATEGORIES.includes(value))throw fail();
 if(parentCategory!==undefined){
  if(!CHAT_CATEGORIES.includes(parentCategory)||topic&&categoryTopic(parentCategory)!==topic||value!=='GENERAL'&&categoryTopic(value)!==categoryTopic(parentCategory))throw fail();
  return parentCategory==='ANNOUNCEMENT'&&value!=='ANNOUNCEMENT'?'GENERAL':parentCategory;
 }
 if(!topic)return value;
 if(value==='GENERAL')return topic;
 if(categoryTopic(value)!==topic)throw fail();
 return value;
}
