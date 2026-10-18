// Metadata review only. Reachability never proves row ownership or permits deletion.
export function reviewLifecycleDependencies({schema, selected, inventory, dependencies}) {
  const key=(namespace,table)=>JSON.stringify([namespace,table]);
  const actions=new Map(inventory.map(row=>[key(schema,row.table),row.action]));
  const reached=new Set([...selected].map(table=>key(schema,table)));
  const queue=[...reached], incoming=new Map(), result=[], seenEdges=new Set();
  for(const edge of dependencies){
    const parentKey=key(edge.parentSchema,edge.parent);
    if(!incoming.has(parentKey))incoming.set(parentKey,[]);
    incoming.get(parentKey).push(edge);
  }
  for(let cursor=0;cursor<queue.length;cursor++){
    for(const edge of incoming.get(queue[cursor])||[]){
      const childKey=key(edge.childSchema,edge.child);
      const edgeKey=JSON.stringify([edge.childSchema,edge.child,edge.constraint]);
      if(!seenEdges.has(edgeKey)){
        seenEdges.add(edgeKey);
        result.push({table:edge.child,schema:edge.childSchema,parent:edge.parent,
          parentSchema:edge.parentSchema,constraint:edge.constraint,onDelete:edge.deletion,
          action:actions.get(childKey)||'REVIEW',
          crossSchema:edge.childSchema!==schema||edge.parentSchema!==schema});
      }
      // Include KEEP/REVIEW descendants: a database cascade can cross either boundary.
      if(!reached.has(childKey)){reached.add(childKey);queue.push(childKey)}
    }
  }
  return result.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
