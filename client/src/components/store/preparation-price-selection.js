export function restorePreparationSelection(groups,modifiers=[]){
  const selected={};
  for(const old of modifiers){
    if(String(old.id||"").startsWith("synthetic-"))continue;
    for(const group of groups){
      const current=(group.items||[]).find(item=>item.id===old.id);
      if(current){selected[group.id]=[...(selected[group.id]||[]),current];break}
    }
  }
  return selected;
}
