// One ordered, bounded queue per controller. Uncertain input is never retried.
export function createRemoteInputQueue({send,allowed,onError,now=Date.now}){
 let chain=Promise.resolve(),generation=0,pending=0,tail=null;
 return {
  cancel(){generation++;tail=null;},
  enqueue(body,guard=()=>true,group){
   if(!allowed()||!guard()||pending>=100)return Promise.resolve(false);
   if(body.type==='text'&&group!==undefined&&tail&&!tail.started&&tail.version===generation&&tail.group===group&&tail.body.type==='text'&&tail.body.text.length+body.text.length<=200){tail.body.text+=body.text;tail.guards.push(guard);return tail.task;}
   const issued=now(),version=generation,item={body:typeof body==='object'?{...body}:body,guards:[guard],group,version,started:false,task:null};pending++;tail=item;
   const task=chain.then(async()=>{
    item.started=true;if(tail===item)tail=null;
    if(version!==generation||now()-issued>3000||!allowed()||!item.guards.every(check=>check()))return false;
    await send(item.body);return true;
   }).catch(error=>{generation++;onError(error);return false;}).finally(()=>{pending--;});
   item.task=task;chain=task;return task;
  }
 };
}
